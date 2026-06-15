/**
 * @insightop/libopenblt
 *
 * TypeScript implementation of the OpenBLT host library for XCP-based
 * firmware updates over Modbus RTU.
 *
 * API surface aligns 1:1 with the C libopenblt library.
 */

export type { FirmwareParser, FirmwareSegment } from "./firmware.js";
// ── Firmware Data (aligning with firmware.h) ──────────────────
export {
  firmwareAddData,
  firmwareClearData,
  firmwareGetSegment,
  firmwareGetSegmentCount,
  firmwareInit,
  firmwareLoadFromFile,
  firmwareRemoveData,
  firmwareSaveToFile,
  firmwareTerminate,
} from "./firmware.js";
export { HexParser, parseHexLine } from "./hexparser.js";
export type {
  BltSessionSettingsXcpV10,
  BltTransportSettingsXcpV10MbRtu,
} from "./openblt.js";
// ── OpenBLT Library API (aligning with openblt.h) ────────────
export {
  BLT_RESULT_ERROR_GENERIC,
  BLT_RESULT_ERROR_SESSION_INFO_TABLE,
  BLT_RESULT_ERROR_SESSION_INFO_TABLE_NOT_SUPPORTED,
  BLT_RESULT_OK,
  BLT_SESSION_XCP_V10,
  BLT_TRANSPORT_XCP_V10_MBRTU,
  BLT_VERSION_NUMBER,
  BLT_VERSION_STRING,
  bltFirmwareAddData,
  bltFirmwareClearData,
  bltFirmwareGetSegment,
  bltFirmwareGetSegmentCount,
  bltFirmwareInit,
  bltFirmwareLoadFromFile,
  bltFirmwareRemoveData,
  bltFirmwareSaveToFile,
  bltFirmwareTerminate,
  bltSessionCheckInfoTable,
  bltSessionClearMemory,
  bltSessionInit,
  bltSessionReadData,
  bltSessionStart,
  bltSessionStop,
  bltSessionTerminate,
  bltSessionWriteData,
  bltUtilCrc16Calculate,
  bltUtilCrc32Calculate,
  bltUtilCryptoAes256Decrypt,
  bltUtilCryptoAes256Encrypt,
  bltUtilTimeDelayMs,
  bltUtilTimeGetSystemTime,
  bltVersionGetNumber,
  bltVersionGetString,
} from "./openblt.js";
export {
  SeedNKeyAlgorithm,
  seednkeyComputeKeyFromSeed,
  seednkeyGetAvailablePrivileges,
} from "./seednkey.js";
export type { SerialPort } from "./serialport.js";
// ── Serial Port (aligning with serialport.h) ──────────────────
export {
  baudrateEnumFromNumber,
  SerialPortBaudrate,
  SerialPortParity,
  SerialPortStopbits,
} from "./serialport.js";
// ── Session Module (aligning with session.h) ──────────────────
export {
  sessionCheckInfoTable,
  sessionClearMemory,
  sessionInit,
  sessionReadData,
  sessionStart,
  sessionStop,
  sessionTerminate,
  sessionWriteData,
} from "./session.js";
// ── Parsers ──────────────────────────────────────────────────
export { SRecParser } from "./srecparser.js";
// ── Utilities (aligning with util.h) ─────────────────────────
export {
  utilChecksumCrc16Calculate,
  utilChecksumCrc32Calculate,
  utilCryptoAes256Decrypt,
  utilCryptoAes256Encrypt,
  utilTimeDelayMs,
  utilTimeGetSystemTimeMs,
} from "./util.js";
// ── XCP Loader (aligning with xcploader.h) ────────────────────
export {
  getOrderedLong,
  getOrderedWord,
  type SessionProtocol,
  setOrderedLong,
  XcpLoader,
  type XcpTransport,
} from "./xcploader.js";
export type { XcpLoaderSettings } from "./xcploader-types.js";
export {
  createDefaultXcpLoaderSettings,
  XCPLOADER_CMD_BUILD_CHECKSUM,
  XCPLOADER_CMD_CONNECT,
  XCPLOADER_CMD_DISCONNECT,
  XCPLOADER_CMD_GET_STATUS,
  XCPLOADER_CMD_PID_ERR,
  XCPLOADER_CMD_PID_RES,
  XCPLOADER_CMD_PROGRAM,
  XCPLOADER_CMD_PROGRAM_CLEAR,
  XCPLOADER_CMD_PROGRAM_MAX,
  XCPLOADER_CMD_PROGRAM_RESET,
  XCPLOADER_CMD_PROGRAM_START,
  XCPLOADER_CMD_SET_MTA,
  XCPLOADER_DEFAULT_TIMEOUTS,
  XCPLOADER_PACKET_SIZE_MAX,
} from "./xcploader-types.js";
export type { XcpProtectAlgorithm } from "./xcpprotect.js";
// ── XCP Protection / SeedNKey (aligning with xcpprotect.h + seednkey.h) ─
export {
  XCPPROTECT_RESOURCE_CALPAG,
  XCPPROTECT_RESOURCE_DAQ,
  XCPPROTECT_RESOURCE_PGM,
  XCPPROTECT_RESOURCE_STIM,
  xcpProtectComputeKeyFromSeed,
  xcpProtectGetPrivileges,
  xcpProtectInit,
  xcpProtectTerminate,
} from "./xcpprotect.js";
export type { XcpTpMbRtuSettings } from "./xcptpmbrtu.js";
// ── XCP Modbus RTU Transport (aligning with xcptpmbrtu.h) ────
export {
  XCP_TP_MBRTU_DEFAULT_ADDR,
  XCP_TP_MBRTU_FCT_CODE_USER_XCP,
  XcpTpMbRtu,
  xcpTpMbRtuBuildFrame,
  xcpTpMbRtuCrcCalculate,
  xcpTpMbRtuParseFrame,
} from "./xcptpmbrtu.js";
