/**
 * XCP Loader types and constants — aligns with libopenblt xcploader.h + xcploader.c macros.
 *
 * Contains all XCP command codes, PID identifiers, error codes,
 * timeout defaults, and settings interfaces.
 */

// ── XCP Command Codes (matching C #define XCPLOADER_CMD_*) ───

export const XCPLOADER_CMD_CONNECT       = 0xFF
export const XCPLOADER_CMD_GET_STATUS    = 0xFD
export const XCPLOADER_CMD_GET_SEED      = 0xF8
export const XCPLOADER_CMD_UNLOCK        = 0xF7
export const XCPLOADER_CMD_SET_MTA       = 0xF6
export const XCPLOADER_CMD_UPLOAD        = 0xF5
export const XCPLOADER_CMD_SHORT_UPLOAD  = 0xF4
export const XCPLOADER_CMD_BUILD_CHECKSUM = 0xF3
export const XCPLOADER_CMD_USER          = 0xF1
export const XCPLOADER_CMD_DOWNLOAD      = 0xF0
export const XCPLOADER_CMD_PROGRAM_START = 0xD2
export const XCPLOADER_CMD_PROGRAM_CLEAR = 0xD1
export const XCPLOADER_CMD_PROGRAM       = 0xD0
export const XCPLOADER_CMD_PROGRAM_RESET = 0xCF
export const XCPLOADER_CMD_PROGRAM_MAX   = 0xC9
export const XCPLOADER_CMD_GET_ID        = 0xFA
export const XCPLOADER_CMD_SYNCH         = 0xFC
export const XCPLOADER_CMD_DISCONNECT    = 0xFE

// ── XCP Packet Identifiers (matching C #define XCPLOADER_CMD_PID_*) ──

/** Positive response packet ID. */
export const XCPLOADER_CMD_PID_RES = 0xFF

/** Error response packet ID. */
export const XCPLOADER_CMD_PID_ERR = 0xFE

// ── XCP Error Codes (OpenBLT-specific, from C code) ──────────

export const XCPLOADER_ERR_CMD_UNKNOWN = 0x20

// ── XCP USER command sub-codes (matching C defines) ───────────

export const XCPLOADER_USER_CMD_INFOTABLE = 0x17

/** Info table command IDs. */
export const XCPLOADER_IT_CID_GETINFO  = 0x04
export const XCPLOADER_IT_CID_DOWNLOAD = 0x06
export const XCPLOADER_IT_CID_CHECK    = 0x08

// ── Connect retry count (matching C XCPLOADER_CONNECT_RETRIES) ──

export const XCPLOADER_CONNECT_RETRIES = 5

// ── Packet size limit (matching C XCPLOADER_PACKET_SIZE_MAX) ───

export const XCPLOADER_PACKET_SIZE_MAX = 255

// ── Default Timeouts (matching C xcpSettings defaults) ────────

export const XCPLOADER_DEFAULT_TIMEOUTS: Readonly<{
  t1: number; t3: number; t4: number; t5: number; t6: number; t7: number
}> = {
  /** Command response timeout (ms). */
  t1: 1000,
  /** Start programming timeout (ms). */
  t3: 2000,
  /** Erase memory timeout (ms). */
  t4: 10000,
  /** Program memory and reset timeout (ms). */
  t5: 1000,
  /** Connect response timeout (ms). */
  t6: 50,
  /** Busy wait timer timeout (ms). */
  t7: 2000,
} as const

// ── Settings Interface (matching C tXcpLoaderSettings) ────────

/** XCP loader protocol settings. Aligns with C tXcpLoaderSettings. */
export interface XcpLoaderSettings {
  /** Command response timeout in ms. */
  timeoutT1: number
  /** Start programming timeout in ms. */
  timeoutT3: number
  /** Erase memory timeout in ms. */
  timeoutT4: number
  /** Program + reset timeout in ms. */
  timeoutT5: number
  /** Connect response timeout in ms. */
  timeoutT6: number
  /** Busy wait timeout in ms. */
  timeoutT7: number
  /** Connection mode for XCP CONNECT command. */
  connectMode: number
  /** When true, send DISCONNECT instead of PROGRAM_RESET after programming. */
  bypassFirmwareStart: boolean
  /** Path to seed/key algorithm library (null if not needed). */
  seedKeyFile: string | null
}

/** Default XcpLoaderSettings with factory defaults. */
export function createDefaultXcpLoaderSettings(): XcpLoaderSettings {
  return {
    timeoutT1: XCPLOADER_DEFAULT_TIMEOUTS.t1,
    timeoutT3: XCPLOADER_DEFAULT_TIMEOUTS.t3,
    timeoutT4: XCPLOADER_DEFAULT_TIMEOUTS.t4,
    timeoutT5: XCPLOADER_DEFAULT_TIMEOUTS.t5,
    timeoutT6: XCPLOADER_DEFAULT_TIMEOUTS.t6,
    timeoutT7: XCPLOADER_DEFAULT_TIMEOUTS.t7,
    connectMode: 0,
    bypassFirmwareStart: false,
    seedKeyFile: null,
  }
}
