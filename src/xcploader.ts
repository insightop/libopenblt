/**
 * XCP Loader protocol module — aligns with libopenblt xcploader.c / xcploader.h.
 *
 * Implements the XCP master functionality for firmware updates:
 *   CONNECT → GET_STATUS → UNLOCK (if protected) → PROGRAM_START
 *   → SET_MTA → PROGRAM_CLEAR → WRITE_DATA → PROGRAM(0) → PROGRAM_RESET
 *
 * The module provides two API surfaces:
 *   1. SessionProtocol implementation (for session.ts to bridge)
 *   2. Low-level XcpLoaderSendCmd* functions (mirroring C static functions)
 */

import {
  XCPLOADER_CMD_CONNECT,
  XCPLOADER_CMD_GET_STATUS,
  XCPLOADER_CMD_GET_SEED,
  XCPLOADER_CMD_UNLOCK,
  XCPLOADER_CMD_SET_MTA,
  XCPLOADER_CMD_UPLOAD,
  XCPLOADER_CMD_PROGRAM_START,
  XCPLOADER_CMD_PROGRAM_CLEAR,
  XCPLOADER_CMD_PROGRAM,
  XCPLOADER_CMD_PROGRAM_RESET,
  XCPLOADER_CMD_PROGRAM_MAX,
  XCPLOADER_CMD_BUILD_CHECKSUM,
  XCPLOADER_CMD_DISCONNECT,
  XCPLOADER_CMD_USER,
  XCPLOADER_CMD_PID_RES,
  XCPLOADER_CMD_PID_ERR,
  XCPLOADER_ERR_CMD_UNKNOWN,
  XCPLOADER_CONNECT_RETRIES,
  XCPLOADER_PACKET_SIZE_MAX,
  XCPLOADER_USER_CMD_INFOTABLE,
  XCPLOADER_IT_CID_GETINFO,
  XCPLOADER_IT_CID_DOWNLOAD,
  XCPLOADER_IT_CID_CHECK,
  type XcpLoaderSettings,
  createDefaultXcpLoaderSettings,
} from './xcploader-types.js'
import {
  XCPPROTECT_RESOURCE_PGM,
  xcpProtectInit,
  xcpProtectTerminate,
  xcpProtectGetPrivileges,
  xcpProtectComputeKeyFromSeed,
} from './xcpprotect.js'
import {
  firmwareGetSegmentCount,
  firmwareGetSegment,
} from './firmware.js'

// ── Transport Layer Interface (aligns with C tXcpTransport) ───

/**
 * XCP transport layer interface.
 * Aligns with C tXcpTransport struct in xcploader.h.
 * Implementations provide the byte-level send/receive.
 */
export interface XcpTransport {
  /** Initialize the transport. */
  init(settings: unknown): void
  /** Terminate the transport. */
  terminate(): void
  /** Connect the transport (open serial port, etc.). */
  connect(): Promise<boolean>
  /** Disconnect the transport. */
  disconnect(): void
  /**
   * Send an XCP packet and receive the response.
   * @param txPacket XCP command packet (without transport framing)
   * @param timeout Response timeout in ms
   * @returns Response packet data and length
   */
  sendPacket(txPacket: Uint8Array, timeout: number): Promise<{ data: Uint8Array; len: number }>
}

// ── Transport Packet (aligns with C tXcpTransportPacket) ──────

/** Simple packet type for XCP command/response exchange. */
interface XcpTransportPacket {
  data: Uint8Array
  len: number
}

// ── SessionProtocol Interface (for session.ts) ────────────────

/**
 * Protocol interface for session module.
 * Aligns with C tSessionProtocol in session.h.
 */
export interface SessionProtocol {
  init(settings: unknown): void
  terminate(): void
  start(): Promise<boolean>
  stop(): Promise<void>
  clearMemory(address: number, len: number): Promise<boolean>
  writeData(address: number, len: number, data: Uint8Array): Promise<boolean>
  readData(address: number, len: number): Promise<Uint8Array>
  checkInfoTable(): Promise<{ supported: boolean; okay: boolean }>
}

// ── Byte-Order Utilities (aligning with C XcpLoaderSetOrderedLong etc.) ──

/**
 * Store a 32-bit value into a byte buffer with specified byte ordering.
 * Aligns with C XcpLoaderSetOrderedLong.
 */
export function setOrderedLong(value: number, data: Uint8Array, isIntel: boolean): void {
  if (isIntel) {
    data[3] = (value >>> 24) & 0xFF
    data[2] = (value >>> 16) & 0xFF
    data[1] = (value >>> 8) & 0xFF
    data[0] = value & 0xFF
  } else {
    data[0] = (value >>> 24) & 0xFF
    data[1] = (value >>> 16) & 0xFF
    data[2] = (value >>> 8) & 0xFF
    data[3] = value & 0xFF
  }
}

/**
 * Read a 32-bit value from a byte buffer with specified byte ordering.
 * Aligns with C XcpLoaderGetOrderedLong.
 */
export function getOrderedLong(data: Uint8Array, isIntel: boolean): number {
  if (isIntel) {
    return (data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)) >>> 0
  } else {
    return (data[3] | (data[2] << 8) | (data[1] << 16) | (data[0] << 24)) >>> 0
  }
}

/**
 * Read a 16-bit value from a byte buffer with specified byte ordering.
 * Aligns with C XcpLoaderGetOrderedWord.
 */
export function getOrderedWord(data: Uint8Array, isIntel: boolean): number {
  if (isIntel) {
    return data[0] | (data[1] << 8)
  } else {
    return data[1] | (data[0] << 8)
  }
}

// ── XcpLoader Class (implements SessionProtocol) ──────────────

/**
 * XCP Loader — core protocol module for firmware updates.
 * Aligns with C xcpLoader static state and XcpLoader* functions.
 */
export class XcpLoader implements SessionProtocol {
  // ── Internal state (aligns with C static variables) ──
  private xcpConnected_ = false
  private xcpSlaveIsIntel_ = false
  private xcpMaxCto_ = 0
  private xcpMaxProgCto_ = 0
  private xcpMaxDto_ = 0
  private xcpBypassFirmwareStart_ = false
  private xcpSettings_: XcpLoaderSettings = createDefaultXcpLoaderSettings()
  private transport_: XcpTransport | null = null

  /** Getters for testing/introspection. */
  get connected(): boolean { return this.xcpConnected_ }
  get maxCto(): number { return this.xcpMaxCto_ }
  get maxProgCto(): number { return this.xcpMaxProgCto_ }
  get maxDto(): number { return this.xcpMaxDto_ }
  get isIntel(): boolean { return this.xcpSlaveIsIntel_ }

  // ── SessionProtocol implementation ──────────────────────────

  /**
   * Initialize the XCP loader.
   * Aligns with C XcpLoaderInit.
   */
  init(settings: unknown): void {
    this.xcpConnected_ = false
    this.xcpSlaveIsIntel_ = false
    this.xcpMaxCto_ = 0
    this.xcpMaxProgCto_ = 0
    this.xcpMaxDto_ = 0
    this.xcpBypassFirmwareStart_ = false

    if (settings && typeof settings === 'object') {
      const s = settings as Partial<XcpLoaderSettings>
      this.xcpSettings_ = {
        timeoutT1: s.timeoutT1 ?? XCPLOADER_DEFAULT_TIMEOUTS.t1,
        timeoutT3: s.timeoutT3 ?? XCPLOADER_DEFAULT_TIMEOUTS.t3,
        timeoutT4: s.timeoutT4 ?? XCPLOADER_DEFAULT_TIMEOUTS.t4,
        timeoutT5: s.timeoutT5 ?? XCPLOADER_DEFAULT_TIMEOUTS.t5,
        timeoutT6: s.timeoutT6 ?? XCPLOADER_DEFAULT_TIMEOUTS.t6,
        timeoutT7: s.timeoutT7 ?? XCPLOADER_DEFAULT_TIMEOUTS.t7,
        connectMode: s.connectMode ?? 0,
        bypassFirmwareStart: s.bypassFirmwareStart ?? false,
        seedKeyFile: s.seedKeyFile ?? null,
      }
      this.xcpBypassFirmwareStart_ = this.xcpSettings_.bypassFirmwareStart
    }

    // Store and initialize the transport
    // The transport is passed via a wrapper settings object
    if (settings && typeof settings === 'object' && 'transport' in settings) {
      this.transport_ = (settings as { transport: XcpTransport }).transport
      this.transport_.init(settings)
    }

    // Initialize the XCP protection module (aligns with C xcploader.c L233)
    xcpProtectInit(this.xcpSettings_.seedKeyFile)
  }

  /**
   * Terminate the XCP loader.
   * Aligns with C XcpLoaderTerminate.
   */
  terminate(): void {
    // Terminate the XCP protection module (aligns with C xcploader.c L247)
    xcpProtectTerminate()
    if (this.transport_) {
      this.transport_.terminate()
      this.transport_ = null
    }
    this.xcpConnected_ = false
    this.xcpBypassFirmwareStart_ = false
  }

  /**
   * Start the firmware update session.
   * Aligns with C XcpLoaderStart:
   *   connect transport → XCP CONNECT (with retries) → GET_STATUS
   *   → check resource protection → UNLOCK if needed → PROGRAM_START
   */
  async start(): Promise<boolean> {
    if (!this.transport_) throw new Error('Transport not initialized')

    // Stop any existing session first
    await this.stop()

    // Connect the transport layer (aligns with C: transport connected once)
    if (!await this.transport_.connect()) {
      return false
    }

    // XCP CONNECT with retries (aligns with C: reuses same transport connection)
    let connectSuccess = false
    for (let retry = 0; retry < XCPLOADER_CONNECT_RETRIES; retry++) {
      if (await this.sendCmdConnect()) {
        this.xcpConnected_ = true
        connectSuccess = true
        break
      }
    }

    // Disconnect transport if all retries failed (aligns with C)
    if (!connectSuccess) {
      this.transport_.disconnect()
      return false
    }

    // GET_STATUS to check resource protection
    const protectedResources = await this.sendCmdGetStatus()

    // Check if programming resource needs to be unlocked
    if ((protectedResources & XCPPROTECT_RESOURCE_PGM) !== 0) {
      const availableResources = xcpProtectGetPrivileges()
      if ((availableResources & XCPPROTECT_RESOURCE_PGM) === 0) {
        throw new Error('No unlock algorithm available for programming resource')
      }

      // Get seed — aligns with C xcploader.c L370-395 (multi-part seed retrieval)
      const seedParts: Uint8Array[] = []
      let seedTotalLen = 0
      let seedRemainingLen = 0

      // First request (mode=0)
      const firstSeedResult = await this.sendCmdGetSeed(XCPPROTECT_RESOURCE_PGM, 0)
      seedParts.push(firstSeedResult.seed)
      seedTotalLen = firstSeedResult.remainingLen
      seedRemainingLen = firstSeedResult.remainingLen

      // Loop for remaining parts (mode=1) if seed spans multiple responses
      while (seedRemainingLen > (this.xcpMaxDto_ - 2)) {
        const nextSeedResult = await this.sendCmdGetSeed(XCPPROTECT_RESOURCE_PGM, 1)
        seedParts.push(nextSeedResult.seed)
        seedRemainingLen = nextSeedResult.remainingLen
      }

      // Merge all seed parts
      const seed = new Uint8Array(seedTotalLen)
      let seedOffset = 0
      for (const part of seedParts) {
        seed.set(part, seedOffset)
        seedOffset += part.length
      }

      // Only continue with resource unlock if seed is not empty (already unlocked)
      if (seedTotalLen > 0) {
        // Compute key from seed
        const key = xcpProtectComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, seed)

        // Send key — aligns with C xcploader.c L417-444 (multi-part key sending)
        let keyRemainingLen = key.length
        let keyOffset = 0
        let currentlyProtectedResources = 0

        while (keyRemainingLen > 0) {
          const keyCurrentLen = Math.min(keyRemainingLen, this.xcpMaxCto_ - 2)
          const keyChunk = key.subarray(keyOffset, keyOffset + keyCurrentLen)
          currentlyProtectedResources = await this.sendCmdUnlock(keyChunk, key.length)
          keyRemainingLen -= keyCurrentLen
          keyOffset += keyCurrentLen

          // Double-check that unlock succeeded (only verify after all parts sent)
          if (keyRemainingLen === 0) {
            if ((currentlyProtectedResources & XCPPROTECT_RESOURCE_PGM) !== 0) {
              throw new Error('Failed to unlock programming resource')
            }
          }
        }
      }
    }

    // PROGRAM_START
    if (!await this.sendCmdProgramStart()) {
      throw new Error('PROGRAM_START failed')
    }

    return true
  }

  /**
   * Stop the firmware update session.
   * Aligns with C XcpLoaderStop:
   *   PROGRAM(0) to end programming → PROGRAM_RESET or DISCONNECT → disconnect transport
   */
  async stop(): Promise<void> {
    if (this.transport_ && this.xcpConnected_) {
      // Aligns with C XcpLoaderStop (xcploader.c:472-505):
      // Send PROGRAM(0) to end programming. Only if successful, send reset or disconnect.
      let programSuccess = false
      try {
        programSuccess = await this.sendCmdProgram(0, null)
      } catch {
        // Ignore — device may have already reset
      }
      if (programSuccess) {
        if (this.xcpBypassFirmwareStart_) {
          // Bypass: send DISCONNECT to keep bootloader running (aligns with C XcpLoaderStop)
          try { await this.sendCmdDisconnect() } catch {}
        } else {
          // Normal: send PROGRAM_RESET to start user program (aligns with C XcpLoaderStop)
          try { await this.sendCmdProgramReset() } catch {}
        }
      }
      this.transport_.disconnect()
      this.xcpConnected_ = false
    }
  }

  /**
   * Clear (erase) a memory range on the target.
   * Aligns with C XcpLoaderClearMemory: SET_MTA → PROGRAM_CLEAR.
   */
  async clearMemory(address: number, len: number): Promise<boolean> {
    if (len <= 0 || !this.transport_ || !this.xcpConnected_) return false

    if (!await this.sendCmdSetMta(address)) return false
    if (!await this.sendCmdProgramClear(len)) return false
    return true
  }

  /**
   * Write data to the target.
   * Aligns with C XcpLoaderWriteData: SET_MTA → segmented PROGRAM/PROGRAM_MAX.
   */
  async writeData(address: number, len: number, data: Uint8Array): Promise<boolean> {
    if (!data || len <= 0 || !this.transport_ || !this.xcpConnected_) return false

    if (!await this.sendCmdSetMta(address)) return false

    let bufferOffset = 0
    let remaining = len

    while (remaining > 0) {
      // Calculate chunk size (aligns with C logic)
      let currentWriteCnt = remaining % (this.xcpMaxProgCto_ - 1)
      if (currentWriteCnt === 0) {
        currentWriteCnt = this.xcpMaxProgCto_ - 1
      }

      const chunkData = data.subarray(bufferOffset, bufferOffset + currentWriteCnt)

      if (currentWriteCnt < (this.xcpMaxProgCto_ - 1)) {
        // Partial block → PROGRAM
        if (!await this.sendCmdProgram(currentWriteCnt, chunkData)) return false
      } else {
        // Full block → PROGRAM_MAX
        if (!await this.sendCmdProgramMax(chunkData)) return false
      }

      remaining -= currentWriteCnt
      bufferOffset += currentWriteCnt
    }

    return true
  }

  /**
   * Upload (read) data from the target.
   * Aligns with C XcpLoaderReadData: SET_MTA → segmented UPLOAD.
   */
  async readData(address: number, len: number): Promise<Uint8Array> {
    if (len <= 0 || !this.transport_ || !this.xcpConnected_) {
      throw new Error('Invalid read parameters or not connected')
    }

    if (!await this.sendCmdSetMta(address)) {
      throw new Error('SET_MTA failed for read')
    }

    const result = new Uint8Array(len)
    let bufferOffset = 0
    let remaining = len

    while (remaining > 0) {
      let currentReadCnt = remaining % (this.xcpMaxDto_ - 1)
      if (currentReadCnt === 0) {
        currentReadCnt = this.xcpMaxDto_ - 1
      }

      const uploaded = await this.sendCmdUpload(currentReadCnt)
      result.set(uploaded, bufferOffset)

      remaining -= currentReadCnt
      bufferOffset += currentReadCnt
    }

    return result
  }

  /**
   * Check info table on the target.
   * Aligns with C XcpLoaderCheckInfoTable (xcploader.c:692-879).
   *
   * Full flow: GET_INFO → extract info table from firmware data →
   *   DOWNLOAD (send table to device) → CHECK (device verifies)
   */
  async checkInfoTable(): Promise<{ supported: boolean; okay: boolean }> {
    // Phase 1: GET_INFO (aligns with C XcpLoaderSendCmdItCidGetInfo)
    const infoResult = await this.sendCmdItCidGetInfo()
    if (!infoResult) {
      // Aligns with C: any GetInfo failure (ERR_CMD_UNKNOWN, tableLen=0, comm error)
      // → result = false → BLT_RESULT_ERROR_GENERIC
      return { supported: false, okay: false }
    }

    // Phase 2: Extract info table from firmware segments
    // Aligns with C xcploader.c:739-773 (iterate segments, find matching range)
    const { tableAddress, tableLen } = infoResult
    let infoTableData: Uint8Array | null = null
    const segCount = firmwareGetSegmentCount()

    for (let i = 0; i < segCount; i++) {
      const seg = firmwareGetSegment(i)
      if (!seg) continue
      if (tableAddress >= seg.base && tableAddress + tableLen <= seg.base + seg.length) {
        const offset = tableAddress - seg.base
        infoTableData = seg.data.slice(offset, offset + tableLen)
        break
      }
    }

    if (!infoTableData) {
      // Info table address not found in loaded firmware data — data error
      return { supported: false, okay: false }
    }

    // Phase 3: DOWNLOAD info table in chunks (aligns with C xcploader.c:778-827)
    const maxChunkLen = this.xcpMaxCto_ - 4
    let offset = 0
    while (offset < infoTableData.length) {
      const chunkLen = Math.min(maxChunkLen, infoTableData.length - offset)
      const chunk = infoTableData.subarray(offset, offset + chunkLen)
      const dlResult = await this.sendCmdItCidDownload(chunk)
      if (!dlResult) {
        // Aligns with C: download failure → result = false → BLT_RESULT_ERROR_GENERIC
        return { supported: false, okay: false }
      }
      offset += chunkLen
    }

    // Phase 4: CHECK (aligns with C xcploader.c:832-849)
    const checkResult = await this.sendCmdItCidCheck()
    return { supported: true, okay: checkResult }
  }

  // ── XCP Command Functions (private, aligning with C XcpLoaderSendCmd*) ──

  /**
   * Send raw XCP command and get response.
   * Aligns with the core send/receive pattern in C.
   */
  private async sendRawCmd(
    cmd: number,
    data: Uint8Array | null,
    timeout: number,
  ): Promise<XcpTransportPacket> {
    if (!this.transport_) throw new Error('Transport not initialized')

    // Build command packet
    const cmdLen = 1 + (data?.length ?? 0)
    const cmdPacket = new Uint8Array(cmdLen)
    cmdPacket[0] = cmd
    if (data && data.length > 0) {
      cmdPacket.set(data, 1)
    }

    const response = await this.transport_.sendPacket(cmdPacket, timeout)
    return { data: response.data, len: response.len }
  }

  /**
   * Send XCP command and validate positive response.
   * Returns response data after stripping PID_RES.
   */
  private async sendCmd(
    cmd: number,
    data: Uint8Array | null,
    timeout: number,
  ): Promise<Uint8Array> {
    const res = await this.sendRawCmd(cmd, data, timeout)

    if (res.len === 0 || res.data[0] !== XCPLOADER_CMD_PID_RES) {
      const errCode = res.len >= 2 ? res.data[1] : 0
      throw new Error(
        `XCP CMD 0x${cmd.toString(16)} failed: PID=0x${res.data[0]?.toString(16) ?? '?'} err=0x${errCode.toString(16)}`,
      )
    }

    return res.data.slice(1)
  }

  /**
   * Send XCP CONNECT command.
   * Aligns with C XcpLoaderSendCmdConnect.
   */
  private async sendCmdConnect(): Promise<boolean> {
    if (!this.transport_) return false

    try {
      const cmdPacket = new Uint8Array(2)
      cmdPacket[0] = XCPLOADER_CMD_CONNECT
      cmdPacket[1] = this.xcpSettings_.connectMode

      const res = await this.transport_.sendPacket(cmdPacket, this.xcpSettings_.timeoutT6)

      // Validate response
      if (res.len !== 8 || res.data[0] !== XCPLOADER_CMD_PID_RES) {
        return false
      }

      // Parse response (aligns with C xcploader.c:1028-1061)
      this.xcpSlaveIsIntel_ = (res.data[2] & 0x01) === 0
      this.xcpMaxCto_ = res.data[3]
      this.xcpMaxProgCto_ = this.xcpMaxCto_

      if (this.xcpSlaveIsIntel_) {
        this.xcpMaxDto_ = res.data[4] | (res.data[5] << 8)
      } else {
        this.xcpMaxDto_ = res.data[5] | (res.data[4] << 8)
      }

      // Validate sizes (aligns with C checks)
      if (this.xcpMaxCto_ > XCPLOADER_PACKET_SIZE_MAX) {
        this.xcpMaxCto_ = XCPLOADER_PACKET_SIZE_MAX
      }
      if (this.xcpMaxDto_ > XCPLOADER_PACKET_SIZE_MAX) {
        return false
      }
      if (this.xcpMaxCto_ === 0 || this.xcpMaxDto_ === 0) {
        return false
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Send XCP GET_STATUS command.
   * Aligns with C XcpLoaderSendCmdGetStatus.
   *
   * C code (xcploader.c:1107-1125) handles an edge case where a stale CONNECT
   * response might arrive before the GET_STATUS response. If an 8-byte PID_RES
   * packet arrives first, it re-receives with the short T6 timeout to get the
   * actual GET_STATUS response.
   *
   * @returns protectedResources bitmask
   */
  private async sendCmdGetStatus(): Promise<number> {
    const res = await this.sendRawCmd(XCPLOADER_CMD_GET_STATUS, null, this.xcpSettings_.timeoutT1)

    // Check for stale CONNECT response (aligns with C xcploader.c:1110-1125)
    // If we get an 8-byte CONNECT-like response, try to receive again with short timeout
    let actualRes = res
    if (res.len === 8 && res.data[0] === XCPLOADER_CMD_PID_RES) {
      // This looks like a stale CONNECT response. Try to receive the real GET_STATUS.
      // C code: cmdPacket.len = 0; sendPacket(&cmdPacket, &resPacket, timeoutT6)
      // A zero-length sendPacket just receives without sending.
      try {
        const secondRes = await this.transport_!.sendPacket(new Uint8Array(0), this.xcpSettings_.timeoutT6)
        actualRes = { data: secondRes.data, len: secondRes.len }
      } catch {
        // Aligns with C: re-receive failure → result = false
        throw new Error('GET_STATUS failed: stale CONNECT response, re-receive failed')
      }
    }

    if (actualRes.len === 0 || actualRes.data[0] !== XCPLOADER_CMD_PID_RES) {
      throw new Error('GET_STATUS failed: invalid response')
    }

    // GET_STATUS response (6 bytes total, raw with PID):
    //   data[0] = PID_RES (0xFF)
    //   data[1] = session status
    //   data[2] = protectedResources
    //   data[3..4] = reserved
    //   data[5] = configId (low byte)
    if (actualRes.len < 6) {
      throw new Error('GET_STATUS response too short')
    }

    return actualRes.data[2] // protectedResources
  }

  /**
   * Send XCP GET_SEED command (single exchange).
   * Aligns with C XcpLoaderSendCmdGetSeed.
   * Packet: [CMD_GET_SEED][mode][resource] — cmdData contains only mode+resource.
   *
   * Returns the seed chunk received and the remaining seed length reported by the device.
   * For multi-part seeds, the caller should loop calling this with mode=1 until remainingLen <= (maxDto - 2).
   */
  private async sendCmdGetSeed(resource: number, mode: number): Promise<{ seed: Uint8Array; remainingLen: number }> {
    // Payload only — sendRawCmd will prepend the command byte
    const cmdData = new Uint8Array(2)
    cmdData[0] = mode
    cmdData[1] = resource

    const res = await this.sendRawCmd(XCPLOADER_CMD_GET_SEED, cmdData, this.xcpSettings_.timeoutT1)

    if (res.len <= 2 || res.data[0] !== XCPLOADER_CMD_PID_RES) {
      throw new Error('GET_SEED failed')
    }

    const seedLen = res.data[1]
    const currentSeedLen = Math.min(seedLen, this.xcpMaxDto_ - 2)
    return {
      seed: res.data.slice(2, 2 + currentSeedLen),
      remainingLen: seedLen,
    }
  }

  /**
   * Send XCP UNLOCK command (single chunk).
   * Aligns with C XcpLoaderSendCmdUnlock.
   * Packet: [CMD_UNLOCK][totalKeyLen][keyChunk...] — cmdData contains total key length + current chunk.
   *
   * For multi-part keys, the caller should loop calling this with successive chunks.
   * The keyLen field always contains the TOTAL key length (not the current chunk length),
   * matching C code behavior.
   */
  private async sendCmdUnlock(keyChunk: Uint8Array, totalKeyLen: number): Promise<number> {
    const keyCurrentLen = Math.min(keyChunk.length, this.xcpMaxCto_ - 2)

    // Payload only — sendRawCmd will prepend the command byte
    const cmdData = new Uint8Array(1 + keyCurrentLen)
    cmdData[0] = totalKeyLen
    cmdData.set(keyChunk.subarray(0, keyCurrentLen), 1)

    const res = await this.sendRawCmd(XCPLOADER_CMD_UNLOCK, cmdData, this.xcpSettings_.timeoutT1)

    if (res.len !== 2 || res.data[0] !== XCPLOADER_CMD_PID_RES) {
      throw new Error('UNLOCK failed')
    }

    return res.data[1] // protectedResources after unlock
  }

  /**
   * Send XCP SET_MTA command.
   * Aligns with C XcpLoaderSendCmdSetMta.
   */
  private async sendCmdSetMta(address: number): Promise<boolean> {
    const cmdData = new Uint8Array(7)
    cmdData[0] = 0 // reserved
    cmdData[1] = 0 // reserved
    cmdData[2] = 0 // address extension
    setOrderedLong(address, cmdData.subarray(3) as Uint8Array, this.xcpSlaveIsIntel_)

    try {
      await this.sendCmd(XCPLOADER_CMD_SET_MTA, cmdData, this.xcpSettings_.timeoutT1)
      return true
    } catch {
      return false
    }
  }

  /**
   * Send XCP UPLOAD command.
   * Aligns with C XcpLoaderSendCmdUpload.
   * Packet: [CMD_UPLOAD][length] — cmdData contains only length.
   */
  private async sendCmdUpload(length: number): Promise<Uint8Array> {
    // Payload only — sendRawCmd will prepend the command byte
    const cmdData = new Uint8Array(1)
    cmdData[0] = length

    const res = await this.sendRawCmd(XCPLOADER_CMD_UPLOAD, cmdData, this.xcpSettings_.timeoutT1)

    if (res.len === 0 || res.data[0] !== XCPLOADER_CMD_PID_RES) {
      throw new Error('UPLOAD failed')
    }

    return res.data.slice(1, 1 + length)
  }

  /**
   * Send XCP PROGRAM_START command.
   * Aligns with C XcpLoaderSendCmdProgramStart.
   */
  private async sendCmdProgramStart(): Promise<boolean> {
    try {
      const data = await this.sendCmd(
        XCPLOADER_CMD_PROGRAM_START,
        null,
        this.xcpSettings_.timeoutT3,
      )

      // Parse maxProgCto from response
      // Response (7 bytes, PID stripped): [reserved][comm_mode][maxProgCto][bs][st_min][queue]
      if (data.length >= 3) {
        this.xcpMaxProgCto_ = data[2]
        if (this.xcpMaxProgCto_ > XCPLOADER_PACKET_SIZE_MAX) {
          this.xcpMaxProgCto_ = XCPLOADER_PACKET_SIZE_MAX
        }
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Send XCP PROGRAM_RESET command.
   * Aligns with C XcpLoaderSendCmdProgramReset (xcploader.c:1488-1524).
   * Returns true if response received or no response (device may reboot).
   * Returns false only if an invalid response is received.
   */
  private async sendCmdProgramReset(): Promise<boolean> {
    try {
      await this.sendCmd(XCPLOADER_CMD_PROGRAM_RESET, null, this.xcpSettings_.timeoutT5)
      this.xcpConnected_ = false
      return true
    } catch {
      // Response is optional — device may reboot immediately, not an error
      this.xcpConnected_ = false
      return true
    }
  }

  /**
   * Send XCP DISCONNECT command.
   * Aligns with C XcpLoaderSendCmdDisconnect (xcploader.c:1085-1127).
   * Used when bypassFirmwareStart is true to keep bootloader running.
   */
  private async sendCmdDisconnect(): Promise<boolean> {
    try {
      await this.sendCmd(XCPLOADER_CMD_DISCONNECT, null, this.xcpSettings_.timeoutT1)
      return true
    } catch {
      return false
    }
  }

  /**
   * Send XCP PROGRAM command.
   * Aligns with C XcpLoaderSendCmdProgram.
   * When length=0 and data=null, ends the programming session.
   */
  private async sendCmdProgram(length: number, data: Uint8Array | null): Promise<boolean> {
    const cmdData = new Uint8Array(1 + length)
    cmdData[0] = length
    if (data && length > 0) {
      cmdData.set(data, 1)
    }

    try {
      await this.sendCmd(XCPLOADER_CMD_PROGRAM, cmdData, this.xcpSettings_.timeoutT5)
      return true
    } catch {
      return false
    }
  }

  /**
   * Send XCP PROGRAM_MAX command.
   * Aligns with C XcpLoaderSendCmdProgramMax.
   * Full block — no length field, data fills maxProgCto-1 bytes.
   */
  private async sendCmdProgramMax(data: Uint8Array): Promise<boolean> {
    try {
      await this.sendCmd(XCPLOADER_CMD_PROGRAM_MAX, data, this.xcpSettings_.timeoutT5)
      return true
    } catch {
      return false
    }
  }

  /**
   * Send XCP PROGRAM_CLEAR command.
   * Aligns with C XcpLoaderSendCmdProgramClear.
   */
  private async sendCmdProgramClear(length: number): Promise<boolean> {
    const cmdData = new Uint8Array(7)
    cmdData[0] = 0 // mode = absolute
    cmdData[1] = 0 // reserved
    cmdData[2] = 0 // reserved
    setOrderedLong(length, cmdData.subarray(3) as Uint8Array, this.xcpSlaveIsIntel_)

    try {
      await this.sendCmd(XCPLOADER_CMD_PROGRAM_CLEAR, cmdData, this.xcpSettings_.timeoutT4)
      return true
    } catch {
      return false
    }
  }

  /**
   * Send XCP BUILD_CHECKSUM command.
   * Aligns with C (BUILD_CHECKSUM not explicitly in xcploader.c but follows same pattern).
   */
  async buildChecksum(size: number): Promise<number> {
    const cmdData = new Uint8Array(7)
    cmdData[0] = 0 // reserved
    cmdData[1] = 0 // reserved
    cmdData[2] = 0 // address extension
    setOrderedLong(size, cmdData.subarray(3) as Uint8Array, this.xcpSlaveIsIntel_)

    const data = await this.sendCmd(
      XCPLOADER_CMD_BUILD_CHECKSUM,
      cmdData,
      this.xcpSettings_.timeoutT1,
    )

    // Response: checksum as 4 bytes in slave byte order
    if (data.length < 4) {
      throw new Error('BUILD_CHECKSUM response too short')
    }
    return getOrderedLong(data.subarray(0, 4), this.xcpSlaveIsIntel_) >>> 0
  }

  // ── Info Table USER commands (aligning with C XcpLoaderSendCmdItCid*) ──

  /**
   * Send USER CMD GET_INFO for info table.
   * Aligns with C XcpLoaderSendCmdItCidGetInfo.
   * Packet: [CMD_USER][INFOTABLE][GET_INFO] — cmdData contains only sub-command + command ID.
   */
  private async sendCmdItCidGetInfo(): Promise<{ tableAddress: number; tableLen: number } | null> {
    // Payload only — sendRawCmd will prepend CMD_USER (0xF1)
    const cmdData = new Uint8Array(2)
    cmdData[0] = 0x17 // INFOTABLE sub-command
    cmdData[1] = 0x04 // GET_INFO command ID

    try {
      const res = await this.sendRawCmd(XCPLOADER_CMD_USER, cmdData, this.xcpSettings_.timeoutT1)

      // Check for "not supported" error
      if (
        res.len === 2 &&
        res.data[0] === XCPLOADER_CMD_PID_ERR &&
        res.data[1] === XCPLOADER_ERR_CMD_UNKNOWN
      ) {
        return null
      }

      if (res.len !== 8 || res.data[0] !== XCPLOADER_CMD_PID_RES) {
        return null
      }

      const tableLen = getOrderedWord(res.data.subarray(2) as Uint8Array, this.xcpSlaveIsIntel_)
      const tableAddress = getOrderedLong(res.data.subarray(4) as Uint8Array, this.xcpSlaveIsIntel_)

      if (tableLen === 0) {
        // Aligns with C: tableLen=0 → result = false (error)
        return null
      }

      return { tableAddress, tableLen }
    } catch {
      return null
    }
  }

  /**
   * Send USER CMD DOWNLOAD for info table.
   * Aligns with C XcpLoaderSendCmdItCidDownload (xcploader.c:1852-1920).
   * Wire format (after sendRawCmd prepends CMD_USER):
   *   [CMD_USER(0xF1)][INFOTABLE(0x17)][DOWNLOAD(0x06)][len][data...]
   */
  private async sendCmdItCidDownload(data: Uint8Array): Promise<boolean> {
    if (data.length === 0 || data.length > (this.xcpMaxCto_ - 4)) return false

    const cmdData = new Uint8Array(3 + data.length)
    cmdData[0] = XCPLOADER_USER_CMD_INFOTABLE
    cmdData[1] = XCPLOADER_IT_CID_DOWNLOAD
    cmdData[2] = data.length
    cmdData.set(data, 3)

    try {
      const res = await this.sendRawCmd(XCPLOADER_CMD_USER, cmdData, this.xcpSettings_.timeoutT1)
      if (res.len !== 2 || res.data[0] !== XCPLOADER_CMD_PID_RES) {
        return false
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * Send USER CMD CHECK for info table.
   * Aligns with C XcpLoaderSendCmdItCidCheck (xcploader.c:1868-1922).
   * Packet: [CMD_USER][INFOTABLE][CHECK]
   * Response: [PID_RES][reserved][checkResult] where checkResult=1 means OK.
   */
  private async sendCmdItCidCheck(): Promise<boolean> {
    const cmdData = new Uint8Array(2)
    cmdData[0] = XCPLOADER_USER_CMD_INFOTABLE
    cmdData[1] = XCPLOADER_IT_CID_CHECK

    try {
      const res = await this.sendRawCmd(XCPLOADER_CMD_USER, cmdData, this.xcpSettings_.timeoutT1)
      if (res.len !== 3 || res.data[0] !== XCPLOADER_CMD_PID_RES) {
        return false
      }
      return res.data[2] === 1
    } catch {
      return false
    }
  }
}

// Re-export default timeouts (used by other modules)
import { XCPLOADER_DEFAULT_TIMEOUTS } from './xcploader-types.js'
