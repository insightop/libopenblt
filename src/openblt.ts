/**
 * OpenBLT Host Library API — aligns with libopenblt openblt.c / openblt.h.
 *
 * Provides the top-level application interface for firmware updates.
 * Mirrors the C library's BltSession*, BltFirmware*, and BltUtil* APIs.
 *
 * Usage:
 *   bltSessionInit(BLT_SESSION_XCP_V10, sessionSettings, BLT_TRANSPORT_XCP_V10_MBRTU, transportSettings)
 *   await bltSessionStart()
 *   await bltSessionClearMemory(address, len)
 *   await bltSessionWriteData(address, len, data)
 *   bltSessionStop()
 *   bltSessionTerminate()
 */

import {
  XcpLoader,
} from './xcploader.js'
import { XcpTpMbRtu } from './xcptpmbrtu.js'
import {
  sessionInit,
  sessionTerminate,
  sessionStart,
  sessionStop,
  sessionClearMemory,
  sessionWriteData,
  sessionReadData,
  sessionCheckInfoTable,
} from './session.js'
import {
  firmwareInit,
  firmwareTerminate,
  firmwareLoadFromFile,
  firmwareGetSegmentCount,
  firmwareGetSegment,
  firmwareAddData,
  firmwareRemoveData,
  firmwareClearData,
  type FirmwareParser,
} from './firmware.js'
import {
  utilChecksumCrc16Calculate,
  utilChecksumCrc32Calculate,
} from './util.js'

// ── Constants (aligning with C openblt.h macros) ─────────────

/** XCP protocol version 1.0 session type. */
export const BLT_SESSION_XCP_V10 = 0

/** XCP v1.0 Modbus RTU transport type. */
export const BLT_TRANSPORT_XCP_V10_MBRTU = 4

/** Result OK. */
export const BLT_RESULT_OK = 0

/** Result generic error. */
export const BLT_RESULT_ERROR_GENERIC = 1

/** Info table not supported (update can proceed). */
export const BLT_RESULT_ERROR_SESSION_INFO_TABLE_NOT_SUPPORTED = 33

/** Info table check failed (update should be aborted). */
export const BLT_RESULT_ERROR_SESSION_INFO_TABLE = 34

// ── Settings Interfaces (aligning with C typedef structs) ────

/** XCP v1.0 session settings. Aligns with C tBltSessionSettingsXcpV10. */
export interface BltSessionSettingsXcpV10 {
  timeoutT1: number
  timeoutT3: number
  timeoutT4: number
  timeoutT5: number
  timeoutT6: number
  timeoutT7: number
  seedKeyFile: string | null
  connectMode: number
  /** When true, send DISCONNECT instead of PROGRAM_RESET after programming. */
  bypassFirmwareStart?: number
}

/** Modbus RTU transport settings. Aligns with C tBltTransportSettingsXcpV10MbRtu. */
export interface BltTransportSettingsXcpV10MbRtu {
  serialPort: import('./serialport.js').SerialPort
  portName: string
  baudrate: number
  parity: number
  stopbits: number
  destinationAddr: number
}

// ── Session API (aligning with C BltSession* functions) ──────

/**
 * Initialize a firmware update session.
 * Aligns with C BltSessionInit.
 *
 * @param sessionType Must be BLT_SESSION_XCP_V10
 * @param sessionSettings XCP session settings
 * @param transportType Must be BLT_TRANSPORT_XCP_V10_MBRTU
 * @param transportSettings Modbus RTU transport settings
 */
export function bltSessionInit(
  sessionType: number,
  sessionSettings: BltSessionSettingsXcpV10,
  transportType: number,
  transportSettings: BltTransportSettingsXcpV10MbRtu,
): void {
  // Validate session type
  if (sessionType !== BLT_SESSION_XCP_V10) {
    throw new Error(`Unsupported session type: ${sessionType}`)
  }

  // Validate transport type
  if (transportType !== BLT_TRANSPORT_XCP_V10_MBRTU) {
    throw new Error(`Unsupported transport type: ${transportType}`)
  }

  // Terminate any existing session
  bltSessionTerminate()

  // Create and configure the transport layer
  const transport = new XcpTpMbRtu()
  transport.init({
    serialPort: transportSettings.serialPort,
    portName: transportSettings.portName,
    baudrate: transportSettings.baudrate,
    parity: transportSettings.parity,
    stopbits: transportSettings.stopbits,
    destinationAddr: transportSettings.destinationAddr,
  })

  // Create and configure the protocol layer
  const protocol = new XcpLoader()
  protocol.init({
    transport,
    timeoutT1: sessionSettings.timeoutT1,
    timeoutT3: sessionSettings.timeoutT3,
    timeoutT4: sessionSettings.timeoutT4,
    timeoutT5: sessionSettings.timeoutT5,
    timeoutT6: sessionSettings.timeoutT6,
    timeoutT7: sessionSettings.timeoutT7,
    connectMode: sessionSettings.connectMode,
    bypassFirmwareStart: (sessionSettings.bypassFirmwareStart ?? 0) !== 0,
    seedKeyFile: sessionSettings.seedKeyFile,
  })

  // Link protocol to session module
  sessionInit(protocol, protocol)
}

/**
 * Terminate the session.
 * Aligns with C BltSessionTerminate.
 */
export function bltSessionTerminate(): void {
  sessionTerminate()
}

/**
 * Start the firmware update session.
 * Aligns with C BltSessionStart.
 */
export async function bltSessionStart(): Promise<number> {
  try {
    const result = await sessionStart()
    return result ? BLT_RESULT_OK : BLT_RESULT_ERROR_GENERIC
  } catch {
    return BLT_RESULT_ERROR_GENERIC
  }
}

/**
 * Stop the firmware update session.
 * Aligns with C BltSessionStop (blocks until complete).
 */
export async function bltSessionStop(): Promise<void> {
  await sessionStop()
}

/**
 * Clear (erase) memory on the target.
 * Aligns with C BltSessionClearMemory.
 */
export async function bltSessionClearMemory(
  address: number,
  len: number,
): Promise<number> {
  try {
    const result = await sessionClearMemory(address, len)
    return result ? BLT_RESULT_OK : BLT_RESULT_ERROR_GENERIC
  } catch {
    return BLT_RESULT_ERROR_GENERIC
  }
}

/**
 * Write data to the target.
 * Aligns with C BltSessionWriteData.
 */
export async function bltSessionWriteData(
  address: number,
  len: number,
  data: Uint8Array,
): Promise<number> {
  try {
    const result = await sessionWriteData(address, len, data)
    return result ? BLT_RESULT_OK : BLT_RESULT_ERROR_GENERIC
  } catch {
    return BLT_RESULT_ERROR_GENERIC
  }
}

/**
 * Read data from the target.
 * Aligns with C BltSessionReadData.
 */
export async function bltSessionReadData(
  address: number,
  len: number,
): Promise<Uint8Array> {
  try {
    return await sessionReadData(address, len)
  } catch {
    throw new Error('Session read data failed')
  }
}

/**
 * Check info table on the target.
 * Aligns with C BltSessionCheckInfoTable (openblt.c:442-475).
 */
export async function bltSessionCheckInfoTable(): Promise<number> {
  const result = await sessionCheckInfoTable()
  // Aligns with C: when SessionCheckInfoTable returns false → BLT_RESULT_ERROR_GENERIC
  if (!result.supported && !result.okay) return BLT_RESULT_ERROR_GENERIC
  if (!result.supported) return BLT_RESULT_ERROR_SESSION_INFO_TABLE_NOT_SUPPORTED
  if (!result.okay) return BLT_RESULT_ERROR_SESSION_INFO_TABLE
  return BLT_RESULT_OK
}

// ── Firmware API (aligning with C BltFirmware* functions) ────

/**
 * Initialize firmware data module with a parser.
 * Aligns with C BltFirmwareInit.
 */
export function bltFirmwareInit(parser: FirmwareParser | null = null): void {
  firmwareInit(parser)
}

/**
 * Terminate firmware data module.
 * Aligns with C BltFirmwareTerminate.
 */
export function bltFirmwareTerminate(): void {
  firmwareTerminate()
}

/**
 * Load firmware from a file using the linked parser.
 * Aligns with C BltFirmwareLoadFromFile.
 */
export function bltFirmwareLoadFromFile(
  content: string,
  addressOffset: number = 0,
): boolean {
  return firmwareLoadFromFile(content, addressOffset)
}

/**
 * Get firmware segment count.
 * Aligns with C BltFirmwareGetSegmentCount.
 */
export function bltFirmwareGetSegmentCount(): number {
  return firmwareGetSegmentCount()
}

/**
 * Get a firmware segment by index.
 * Aligns with C BltFirmwareGetSegment.
 */
export function bltFirmwareGetSegment(
  idx: number,
): { address: number; len: number; data: Uint8Array } | null {
  const seg = firmwareGetSegment(idx)
  if (!seg) return null
  return { address: seg.base, len: seg.length, data: seg.data }
}

/**
 * Add firmware data.
 * Aligns with C BltFirmwareAddData.
 */
export function bltFirmwareAddData(
  address: number,
  len: number,
  data: Uint8Array,
): boolean {
  return firmwareAddData(address, len, data)
}

/**
 * Remove firmware data.
 * Aligns with C BltFirmwareRemoveData.
 */
export function bltFirmwareRemoveData(address: number, len: number): boolean {
  return firmwareRemoveData(address, len)
}

/**
 * Clear all firmware data.
 * Aligns with C BltFirmwareClearData.
 */
export function bltFirmwareClearData(): void {
  firmwareClearData()
}

// ── Utility API (aligning with C BltUtil* functions) ─────────

/**
 * Calculate CRC16.
 * Aligns with C BltUtilCrc16Calculate.
 */
export function bltUtilCrc16Calculate(data: Uint8Array): number {
  return utilChecksumCrc16Calculate(data)
}

/**
 * Calculate CRC32.
 * Aligns with C BltUtilCrc32Calculate.
 */
export function bltUtilCrc32Calculate(data: Uint8Array): number {
  return utilChecksumCrc32Calculate(data)
}
