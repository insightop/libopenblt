/**
 * @insightop/libopenblt
 *
 * TypeScript implementation of the OpenBLT host library for XCP-based
 * firmware updates over Modbus RTU.
 *
 * API surface aligns 1:1 with the C libopenblt library.
 */

// ── OpenBLT Library API (aligning with openblt.h) ────────────
export {
  BLT_SESSION_XCP_V10,
  BLT_TRANSPORT_XCP_V10_MBRTU,
  BLT_RESULT_OK,
  BLT_RESULT_ERROR_GENERIC,
  BLT_RESULT_ERROR_SESSION_INFO_TABLE_NOT_SUPPORTED,
  BLT_RESULT_ERROR_SESSION_INFO_TABLE,
  bltSessionInit,
  bltSessionTerminate,
  bltSessionStart,
  bltSessionStop,
  bltSessionClearMemory,
  bltSessionWriteData,
  bltSessionReadData,
  bltSessionCheckInfoTable,
  bltFirmwareInit,
  bltFirmwareTerminate,
  bltFirmwareLoadFromFile,
  bltFirmwareGetSegmentCount,
  bltFirmwareGetSegment,
  bltFirmwareAddData,
  bltFirmwareRemoveData,
  bltFirmwareClearData,
  bltUtilCrc16Calculate,
  bltUtilCrc32Calculate,
} from './openblt.js'
export type {
  BltSessionSettingsXcpV10,
  BltTransportSettingsXcpV10MbRtu,
} from './openblt.js'

// ── Session Module (aligning with session.h) ──────────────────
export {
  sessionInit,
  sessionTerminate,
  sessionStart,
  sessionStop,
  sessionClearMemory,
  sessionWriteData,
  sessionReadData,
  sessionCheckInfoTable,
} from './session.js'

// ── XCP Loader (aligning with xcploader.h) ────────────────────
export {
  XcpLoader,
  type XcpTransport,
  type SessionProtocol,
  setOrderedLong,
  getOrderedLong,
  getOrderedWord,
} from './xcploader.js'
export {
  XCPLOADER_CMD_CONNECT,
  XCPLOADER_CMD_GET_STATUS,
  XCPLOADER_CMD_PROGRAM_START,
  XCPLOADER_CMD_PROGRAM,
  XCPLOADER_CMD_PROGRAM_MAX,
  XCPLOADER_CMD_PROGRAM_CLEAR,
  XCPLOADER_CMD_PROGRAM_RESET,
  XCPLOADER_CMD_DISCONNECT,
  XCPLOADER_CMD_SET_MTA,
  XCPLOADER_CMD_BUILD_CHECKSUM,
  XCPLOADER_CMD_PID_RES,
  XCPLOADER_CMD_PID_ERR,
  XCPLOADER_PACKET_SIZE_MAX,
  XCPLOADER_DEFAULT_TIMEOUTS,
  createDefaultXcpLoaderSettings,
} from './xcploader-types.js'
export type { XcpLoaderSettings } from './xcploader-types.js'

// ── XCP Protection / SeedNKey (aligning with xcpprotect.h + seednkey.h) ─
export {
  XCPPROTECT_RESOURCE_PGM,
  XCPPROTECT_RESOURCE_STIM,
  XCPPROTECT_RESOURCE_DAQ,
  XCPPROTECT_RESOURCE_CALPAG,
  xcpProtectInit,
  xcpProtectTerminate,
  xcpProtectGetPrivileges,
  xcpProtectComputeKeyFromSeed,
} from './xcpprotect.js'

// ── XCP Modbus RTU Transport (aligning with xcptpmbrtu.h) ────
export {
  XcpTpMbRtu,
  xcpTpMbRtuCrcCalculate,
  xcpTpMbRtuBuildFrame,
  xcpTpMbRtuParseFrame,
  xcpTpMbRtuBuildWriteRegisterFrame,
  xcpTpMbRtuParseWriteRegisterResponse,
  XCP_TP_MBRTU_FCT_CODE_USER_XCP,
  XCP_TP_MBRTU_DEFAULT_ADDR,
} from './xcptpmbrtu.js'
export type { XcpTpMbRtuSettings } from './xcptpmbrtu.js'

// ── Serial Port (aligning with serialport.h) ──────────────────
export {
  SerialPortBaudrate,
  SerialPortParity,
  SerialPortStopbits,
  baudrateEnumFromNumber,
} from './serialport.js'
export type { SerialPort } from './serialport.js'

// ── Firmware Data (aligning with firmware.h) ──────────────────
export {
  firmwareInit,
  firmwareTerminate,
  firmwareLoadFromFile,
  firmwareGetSegmentCount,
  firmwareGetSegment,
  firmwareAddData,
  firmwareRemoveData,
  firmwareClearData,
  firmwareGetFirstAddress,
  firmwareGetLastAddress,
} from './firmware.js'
export type { FirmwareSegment, FirmwareParser } from './firmware.js'

// ── Parsers ──────────────────────────────────────────────────
export { SRecParser } from './srecparser.js'
export { HexParser, parseHexLine } from './hexparser.js'

// ── Utilities (aligning with util.h) ─────────────────────────
export {
  utilChecksumCrc16Calculate,
  utilChecksumCrc32Calculate,
  utilTimeGetSystemTimeMs,
  utilTimeDelayMs,
  utilCryptoAes256Encrypt,
  utilCryptoAes256Decrypt,
} from './util.js'
