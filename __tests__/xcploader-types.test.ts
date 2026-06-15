import { describe, it, expect } from 'vitest'
import {
  XCPLOADER_CMD_CONNECT,
  XCPLOADER_CMD_GET_STATUS,
  XCPLOADER_CMD_PROGRAM_START,
  XCPLOADER_CMD_PROGRAM,
  XCPLOADER_CMD_PROGRAM_RESET,
  XCPLOADER_CMD_PID_RES,
  XCPLOADER_CMD_PID_ERR,
  XCPLOADER_DEFAULT_TIMEOUTS,
  XCPLOADER_PACKET_SIZE_MAX,
  createDefaultXcpLoaderSettings,
} from '../src/xcploader-types.js'

describe('xcploader-types constants', () => {
  it('XCPLOADER_CMD_CONNECT is 0xFF', () => {
    expect(XCPLOADER_CMD_CONNECT).toBe(0xFF)
  })

  it('XCPLOADER_CMD_GET_STATUS is 0xFD', () => {
    expect(XCPLOADER_CMD_GET_STATUS).toBe(0xFD)
  })

  it('XCPLOADER_CMD_PROGRAM_START is 0xD2', () => {
    expect(XCPLOADER_CMD_PROGRAM_START).toBe(0xD2)
  })

  it('XCPLOADER_CMD_PROGRAM is 0xD0', () => {
    expect(XCPLOADER_CMD_PROGRAM).toBe(0xD0)
  })

  it('XCPLOADER_CMD_PROGRAM_RESET is 0xCF', () => {
    expect(XCPLOADER_CMD_PROGRAM_RESET).toBe(0xCF)
  })

  it('PID_RES is 0xFF', () => {
    expect(XCPLOADER_CMD_PID_RES).toBe(0xFF)
  })

  it('PID_ERR is 0xFE', () => {
    expect(XCPLOADER_CMD_PID_ERR).toBe(0xFE)
  })

  it('default timeouts match C values', () => {
    expect(XCPLOADER_DEFAULT_TIMEOUTS.t1).toBe(1000)
    expect(XCPLOADER_DEFAULT_TIMEOUTS.t3).toBe(2000)
    expect(XCPLOADER_DEFAULT_TIMEOUTS.t4).toBe(10000)
    expect(XCPLOADER_DEFAULT_TIMEOUTS.t5).toBe(1000)
    expect(XCPLOADER_DEFAULT_TIMEOUTS.t6).toBe(50)
    expect(XCPLOADER_DEFAULT_TIMEOUTS.t7).toBe(2000)
  })

  it('PACKET_SIZE_MAX is 255', () => {
    expect(XCPLOADER_PACKET_SIZE_MAX).toBe(255)
  })
})

describe('createDefaultXcpLoaderSettings', () => {
  it('returns settings with default values', () => {
    const s = createDefaultXcpLoaderSettings()
    expect(s.timeoutT1).toBe(1000)
    expect(s.connectMode).toBe(0)
    expect(s.seedKeyFile).toBeNull()
  })
})
