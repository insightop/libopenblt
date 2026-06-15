import { describe, it, expect, vi } from 'vitest'
import {
  setOrderedLong,
  getOrderedLong,
  getOrderedWord,
  XcpLoader,
  type XcpTransport,
} from '../src/xcploader.js'
import { XCPLOADER_CMD_PID_RES } from '../src/xcploader-types.js'

// ── Byte-order utility tests ─────────────────────────────────

describe('setOrderedLong / getOrderedLong', () => {
  it('round-trips Intel (LE) byte order', () => {
    const buf = new Uint8Array(4)
    setOrderedLong(0x12345678, buf, true)
    expect(getOrderedLong(buf, true)).toBe(0x12345678)
  })

  it('round-trips Motorola (BE) byte order', () => {
    const buf = new Uint8Array(4)
    setOrderedLong(0x12345678, buf, false)
    expect(getOrderedLong(buf, false)).toBe(0x12345678)
  })

  it('Intel: LSB first', () => {
    const buf = new Uint8Array(4)
    setOrderedLong(0x12345678, buf, true)
    expect(buf[0]).toBe(0x78) // LSB
    expect(buf[3]).toBe(0x12) // MSB
  })

  it('Motorola: MSB first', () => {
    const buf = new Uint8Array(4)
    setOrderedLong(0x12345678, buf, false)
    expect(buf[0]).toBe(0x12) // MSB
    expect(buf[3]).toBe(0x78) // LSB
  })

  it('handles zero correctly', () => {
    const buf = new Uint8Array(4)
    setOrderedLong(0, buf, true)
    expect(getOrderedLong(buf, true)).toBe(0)
  })

  it('handles max uint32', () => {
    const buf = new Uint8Array(4)
    setOrderedLong(0xFFFFFFFF, buf, true)
    expect(getOrderedLong(buf, true) >>> 0).toBe(0xFFFFFFFF)
  })
})

describe('getOrderedWord', () => {
  it('round-trips Intel (LE) byte order', () => {
    const buf = new Uint8Array([0x34, 0x12])
    expect(getOrderedWord(buf, true)).toBe(0x1234)
  })

  it('round-trips Motorola (BE) byte order', () => {
    const buf = new Uint8Array([0x12, 0x34])
    expect(getOrderedWord(buf, false)).toBe(0x1234)
  })
})

// ── Mock Transport for XcpLoader tests ───────────────────────

function createMockTransport(): XcpTransport & {
  simulateConnectResponse: (maxCto: number, maxDto: number, isIntel: boolean) => void
  simulateGetStatusResponse: (protectedResources: number) => void
  simulateProgramStartResponse: (maxProgCto: number) => void
  simulateGetSeedResponse: (seed: Uint8Array, remainingLen: number) => void
  simulateUnlockResponse: (protectedResources: number) => void
  simulateProgramResponse: (success: boolean) => void
  simulateProgramResetResponse: (success: boolean) => void
  lastSentPacket: Uint8Array | null
  sendPacketMock: ReturnType<typeof vi.fn>
} {
  let connectResponse: { data: Uint8Array; len: number } | null = null
  let getStatusResponse: { data: Uint8Array; len: number } | null = null
  let programStartResponse: { data: Uint8Array; len: number } | null = null
  let getSeedResponse: { data: Uint8Array; len: number } | null = null
  let unlockResponse: { data: Uint8Array; len: number } | null = null
  let programResponse: { data: Uint8Array; len: number } | null = null
  let programResetResponse: { data: Uint8Array; len: number } | null = null

  const mock: ReturnType<typeof createMockTransport> = {
    lastSentPacket: null,
    sendPacketMock: vi.fn(),
    init: vi.fn(),
    terminate: vi.fn(),
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn(),
    async sendPacket(txPacket: Uint8Array, _timeout: number) {
      mock.lastSentPacket = new Uint8Array(txPacket)
      const cmd = txPacket[0]

      // CONNECT response
      if (cmd === 0xFF && connectResponse) {
        return connectResponse
      }

      // GET_STATUS response
      if (cmd === 0xFD && getStatusResponse) {
        return getStatusResponse
      }

      // PROGRAM_START response
      if (cmd === 0xD2 && programStartResponse) {
        return programStartResponse
      }

      // GET_SEED response
      if (cmd === 0xF8 && getSeedResponse) {
        return getSeedResponse
      }

      // UNLOCK response
      if (cmd === 0xF7 && unlockResponse) {
        return unlockResponse
      }

      // PROGRAM response (0xD0)
      if (cmd === 0xD0 && programResponse) {
        return programResponse
      }

      // PROGRAM_RESET response (0xCF)
      if (cmd === 0xCF && programResetResponse) {
        return programResetResponse
      }

      // Default: positive response (PID_RES + empty)
      return { data: new Uint8Array([XCPLOADER_CMD_PID_RES]), len: 1 }
    },
    simulateConnectResponse(maxCto, maxDto, isIntel) {
      const data = new Uint8Array(8)
      data[0] = XCPLOADER_CMD_PID_RES
      data[1] = 0x00 // resource protection
      data[2] = isIntel ? 0x00 : 0x01 // comm_mode bit0=1 means Motorola
      data[3] = maxCto
      if (isIntel) {
        data[4] = maxDto & 0xFF
        data[5] = (maxDto >> 8) & 0xFF
      } else {
        data[4] = (maxDto >> 8) & 0xFF
        data[5] = maxDto & 0xFF
      }
      connectResponse = { data, len: 8 }
    },
    simulateGetStatusResponse(protectedResources) {
      const data = new Uint8Array(6)
      data[0] = XCPLOADER_CMD_PID_RES
      data[1] = 0x00 // session
      data[2] = protectedResources
      getStatusResponse = { data, len: 6 }
    },
    simulateProgramStartResponse(maxProgCto) {
      const data = new Uint8Array(7)
      data[0] = XCPLOADER_CMD_PID_RES
      data[1] = 0 // reserved
      data[2] = 0 // comm_mode
      data[3] = maxProgCto
      data[4] = 0 // bs
      data[5] = 0 // st_min
      data[6] = 0 // queue
      programStartResponse = { data, len: 7 }
    },
    simulateGetSeedResponse(seed, remainingLen) {
      // GET_SEED response: [PID_RES][remainingLen][seed...]
      const data = new Uint8Array(2 + seed.length)
      data[0] = XCPLOADER_CMD_PID_RES
      data[1] = remainingLen
      data.set(seed, 2)
      getSeedResponse = { data, len: data.length }
    },
    simulateUnlockResponse(protectedResources) {
      const data = new Uint8Array(2)
      data[0] = XCPLOADER_CMD_PID_RES
      data[1] = protectedResources
      unlockResponse = { data, len: 2 }
    },
    simulateProgramResponse(success) {
      if (success) {
        programResponse = { data: new Uint8Array([XCPLOADER_CMD_PID_RES]), len: 1 }
      } else {
        programResponse = { data: new Uint8Array([0xFE, 0x20]), len: 2 } // ERR_CMD_UNKNOWN
      }
    },
    simulateProgramResetResponse(success) {
      if (success) {
        programResetResponse = { data: new Uint8Array([XCPLOADER_CMD_PID_RES]), len: 1 }
      } else {
        programResetResponse = { data: new Uint8Array([0xFE, 0x20]), len: 2 }
      }
    },
  }

  return mock
}

// ── XcpLoader tests ──────────────────────────────────────────

describe('XcpLoader', () => {
  it('initializes with default settings', () => {
    const loader = new XcpLoader()
    loader.init({})
    expect(loader.connected).toBe(false)
    expect(loader.maxCto).toBe(0)
  })

  it('stores transport reference', () => {
    const loader = new XcpLoader()
    const transport = createMockTransport()
    loader.init({ transport })
    expect(transport.init).toHaveBeenCalled()
  })

  it('start() connects and performs XCP handshake', async () => {
    const loader = new XcpLoader()
    const transport = createMockTransport()
    transport.simulateConnectResponse(64, 200, true)
    transport.simulateGetStatusResponse(0x00) // no protection
    transport.simulateProgramStartResponse(64)

    loader.init({ transport })
    const result = await loader.start()

    expect(result).toBe(true)
    expect(loader.connected).toBe(true)
    expect(loader.maxCto).toBe(64)
    expect(loader.isIntel).toBe(true)
  })

  it('start() returns false when transport connect fails', async () => {
    const loader = new XcpLoader()
    const transport = createMockTransport()
    transport.connect.mockResolvedValue(false)

    loader.init({ transport })
    const result = await loader.start()

    expect(result).toBe(false)
  })

  it('stop() sends PROGRAM(0) then PROGRAM_RESET only if PROGRAM(0) succeeds', async () => {
    const loader = new XcpLoader()
    const transport = createMockTransport()
    transport.simulateConnectResponse(64, 200, true)
    transport.simulateGetStatusResponse(0x00)
    transport.simulateProgramStartResponse(64)
    transport.simulateProgramResponse(true) // PROGRAM(0) succeeds
    transport.simulateProgramResetResponse(true)

    loader.init({ transport })
    await loader.start()

    // Track all sent packets
    const sentPackets: Uint8Array[] = []
    const origSend = transport.sendPacket.bind(transport)
    transport.sendPacket = async function(tx) {
      sentPackets.push(new Uint8Array(tx))
      return origSend(tx, 1000)
    }

    await loader.stop()

    // Should have sent PROGRAM(0) (0xD0) and PROGRAM_RESET (0xCF)
    const programPkt = sentPackets.find(p => p[0] === 0xD0)
    const resetPkt = sentPackets.find(p => p[0] === 0xCF)
    expect(programPkt).toBeDefined()
    expect(resetPkt).toBeDefined()
    expect(transport.disconnect).toHaveBeenCalled()
    expect(loader.connected).toBe(false)
  })

  it('stop() skips PROGRAM_RESET when PROGRAM(0) fails', async () => {
    const loader = new XcpLoader()
    const transport = createMockTransport()
    transport.simulateConnectResponse(64, 200, true)
    transport.simulateGetStatusResponse(0x00)
    transport.simulateProgramStartResponse(64)
    transport.simulateProgramResponse(false) // PROGRAM(0) fails
    transport.simulateProgramResetResponse(true)

    loader.init({ transport })
    await loader.start()

    // Track all sent packets
    const sentPackets: Uint8Array[] = []
    const origSend = transport.sendPacket.bind(transport)
    transport.sendPacket = async function(tx) {
      sentPackets.push(new Uint8Array(tx))
      return origSend(tx, 1000)
    }

    await loader.stop()

    // Should have sent PROGRAM(0) but NOT PROGRAM_RESET
    const programPkt = sentPackets.find(p => p[0] === 0xD0)
    const resetPkt = sentPackets.find(p => p[0] === 0xCF)
    expect(programPkt).toBeDefined()
    expect(resetPkt).toBeUndefined() // PROGRAM_RESET should NOT be sent
    expect(transport.disconnect).toHaveBeenCalled()
    expect(loader.connected).toBe(false)
  })

  it('start() with resource protection performs seed/key unlock', async () => {
    const loader = new XcpLoader()
    const transport = createMockTransport()
    transport.simulateConnectResponse(64, 200, true)
    transport.simulateGetStatusResponse(0x10) // PGM protected
    transport.simulateProgramStartResponse(64)

    // Mock GET_SEED response: seed = [0x05, 0x03] (2 bytes), remainingLen = 0
    // Default algorithm: key[i] = seed[i] - 1 → key = [0x04, 0x02]
    transport.simulateGetSeedResponse(new Uint8Array([0x05, 0x03]), 0)
    // Mock UNLOCK response: protection cleared
    transport.simulateUnlockResponse(0x00)

    loader.init({ transport })
    const result = await loader.start()

    expect(result).toBe(true)
    expect(loader.connected).toBe(true)
  })

  it('CONNECT packet has correct format: [CMD=0xFF][connectMode]', async () => {
    const loader = new XcpLoader()
    const transport = createMockTransport()
    transport.simulateConnectResponse(64, 200, true)
    transport.simulateGetStatusResponse(0x00)
    transport.simulateProgramStartResponse(64)

    // Track sent packets
    const sentPackets: Uint8Array[] = []
    const origSend = transport.sendPacket.bind(transport)
    transport.sendPacket = async function(tx) {
      sentPackets.push(new Uint8Array(tx))
      return origSend(tx, 1000)
    }

    loader.init({ transport })
    await loader.start()

    // First packet should be CONNECT: [0xFF, 0x00]
    expect(sentPackets.length).toBeGreaterThan(0)
    expect(sentPackets[0][0]).toBe(0xFF) // CONNECT command
    expect(sentPackets[0][1]).toBe(0x00) // connectMode
    expect(sentPackets[0].length).toBe(2) // exactly 2 bytes
  })

  it('clearMemory() sends SET_MTA + PROGRAM_CLEAR', async () => {
    const loader = new XcpLoader()
    const transport = createMockTransport()
    transport.simulateConnectResponse(64, 200, true)
    transport.simulateGetStatusResponse(0x00)
    transport.simulateProgramStartResponse(64)

    loader.init({ transport })
    await loader.start()

    const sentPackets: Uint8Array[] = []
    const origSend = transport.sendPacket.bind(transport)
    transport.sendPacket = async function(tx) {
      sentPackets.push(new Uint8Array(tx))
      return origSend(tx, 1000)
    }

    const result = await loader.clearMemory(0x08008000, 16384)

    expect(result).toBe(true)
    // Should have sent SET_MTA (0xF6) and PROGRAM_CLEAR (0xD1)
    const setMtaPkt = sentPackets.find(p => p[0] === 0xF6)
    const clearPkt = sentPackets.find(p => p[0] === 0xD1)
    expect(setMtaPkt).toBeDefined()
    expect(clearPkt).toBeDefined()
  })
})
