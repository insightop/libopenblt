/**
 * Utility module — aligns with libopenblt util.c / util.h.
 *
 * Provides general-purpose CRC16/CRC32, system time, delay, and AES-256.
 * NOTE: The CRC16 here uses polynomial 0x8005 (initial=0) per util.c.
 *       For Modbus RTU CRC16 (polynomial 0xA001, initial=0xFFFF),
 *       see xcptpmbrtu.ts XcpTpMbRtuCrcCalculate().
 */

// ── CRC16 (polynomial 0x8005, initial 0) ─────────────────────

/** Lookup table for CRC16, generated with polynomial 0x8005 and initial value 0. */
const CRC16_TABLE: readonly number[] = (() => {
  const table = new Array<number>(256)
  for (let i = 0; i < 256; i++) {
    let crc = i << 8
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x8005
      } else {
        crc = crc << 1
      }
    }
    table[i] = crc & 0xFFFF
  }
  return table
})()

/**
 * Calculate 16-bit CRC with polynomial 0x8005, initial value 0.
 * Aligns with util.c UtilChecksumCrc16Calculate.
 */
export function utilChecksumCrc16Calculate(data: Uint8Array): number {
  let result = 0
  for (let i = 0; i < data.length; i++) {
    result = ((result << 8) ^ CRC16_TABLE[((result >> 8) ^ data[i]) & 0xFF]) & 0xFFFF
  }
  return result
}

// ── CRC32 (polynomial 0x04C11DB7, initial 0) ────────────────

/** Lookup table for CRC32. */
const CRC32_TABLE: readonly number[] = (() => {
  const table = new Array<number>(256)
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320 // reflected polynomial
      } else {
        crc = crc >>> 1
      }
    }
    table[i] = crc >>> 0
  }
  return table
})()

/**
 * Calculate 32-bit CRC with polynomial 0x04C11DB7, initial value 0.
 * Aligns with util.c UtilChecksumCrc32Calculate.
 */
export function utilChecksumCrc32Calculate(data: Uint8Array): number {
  let result = 0
  for (let i = 0; i < data.length; i++) {
    result = (result >>> 8) ^ CRC32_TABLE[(result ^ data[i]) & 0xFF]
  }
  return (result ^ 0xFFFFFFFF) >>> 0
}

// ── System Time ──────────────────────────────────────────────

/**
 * Get current system time in milliseconds.
 * Aligns with util.c UtilTimeGetSystemTimeMs.
 */
export function utilTimeGetSystemTimeMs(): number {
  return Date.now()
}

/**
 * Delay for the specified number of milliseconds.
 * Aligns with util.c UtilTimeDelayMs.
 */
export function utilTimeDelayMs(delay: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delay))
}

// ── AES-256 (placeholder — requires Web Crypto or Node crypto) ─

/**
 * Encrypt data using AES-256.
 * Aligns with util.c UtilCryptoAes256Encrypt.
 * @throws Currently throws — not yet implemented.
 */
export function utilCryptoAes256Encrypt(_data: Uint8Array, _key: Uint8Array): Uint8Array {
  throw new Error('AES-256 encrypt not yet implemented — provide seed/key algorithm')
}

/**
 * Decrypt data using AES-256.
 * Aligns with util.c UtilCryptoAes256Decrypt.
 * @throws Currently throws — not yet implemented.
 */
export function utilCryptoAes256Decrypt(_data: Uint8Array, _key: Uint8Array): Uint8Array {
  throw new Error('AES-256 decrypt not yet implemented — provide seed/key algorithm')
}
