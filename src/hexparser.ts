/**
 * Intel HEX parser — extends libopenblt with Intel HEX support.
 *
 * Intel HEX is not part of the official libopenblt (which uses S-Record),
 * but is commonly used in web-based firmware tools. This parser implements
 * the FirmwareParser interface for consistency.
 *
 * HEX record format: :[ByteCount][Address][Type][Data...][Checksum]
 *   - Type 0x00: Data record
 *   - Type 0x01: End of file
 *   - Type 0x04: Extended linear address (high 16 bits of 32-bit address)
 *   - Type 0x02: Extended segment address (8086 mode, rarely used)
 *
 * Checksum: two's complement of sum of all bytes (including byte count).
 */

import { firmwareAddData, type FirmwareParser, type FirmwareSegment } from './firmware.js'

// ── Intel HEX Record Types ───────────────────────────────────

const HEX_TYPE_DATA = 0x00
const HEX_TYPE_END_OF_FILE = 0x01
const HEX_TYPE_EXT_SEGMENT_ADDR = 0x02
const HEX_TYPE_EXT_LINEAR_ADDR = 0x04

// ── Parser ───────────────────────────────────────────────────

/**
 * Parse a single Intel HEX line.
 * @returns Parsed record or null if invalid.
 */
function hexParseLine(line: string): { address: number; type: number; data: number[] } | null {
  if (!line.startsWith(':')) return null
  if (line.length < 11) return null // minimum: :LLAAAA00CC

  const byteCount = parseInt(line.slice(1, 3), 16)
  const address = parseInt(line.slice(3, 7), 16)
  const type = parseInt(line.slice(7, 9), 16)

  // Verify line length: 1(:) + 2(byteCount) + 4(address) + 2(type) + 2*byteCount + 2(checksum)
  const expectedLen = 1 + 2 + 4 + 2 + byteCount * 2 + 2
  if (line.length < expectedLen) return null

  // Verify checksum
  let sum = 0
  for (let i = 1; i < expectedLen - 2; i += 2) {
    sum += parseInt(line.slice(i, i + 2), 16)
  }
  const checksum = parseInt(line.slice(expectedLen - 2, expectedLen), 16)
  if (((sum + checksum) & 0xFF) !== 0x00) return null

  const data: number[] = []
  for (let i = 0; i < byteCount; i++) {
    const offset = 9 + i * 2
    data.push(parseInt(line.slice(offset, offset + 2), 16))
  }

  return { address, type, data }
}

/**
 * Load firmware from Intel HEX content string.
 * Parses all data records and adds them to the firmware module.
 */
function hexLoadFromFile(content: string, addressOffset: number): boolean {
  const lines = content.split(/\r?\n/)
  let parsedCount = 0
  let extendedAddress = 0
  let extendedSegment = 0

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.length === 0) continue

    const parsed = hexParseLine(line)
    if (!parsed) continue

    switch (parsed.type) {
      case HEX_TYPE_EXT_LINEAR_ADDR: {
        // Extended linear address: high 16 bits of 32-bit address
        extendedAddress = ((parsed.data[0] << 8) | parsed.data[1]) << 16
        break
      }
      case HEX_TYPE_EXT_SEGMENT_ADDR: {
        // Extended segment address (8086): shift left by 4
        extendedSegment = ((parsed.data[0] << 8) | parsed.data[1]) << 4
        break
      }
      case HEX_TYPE_DATA: {
        // Data record: compute absolute address
        const base = extendedAddress + extendedSegment + parsed.address + addressOffset
        const data = new Uint8Array(parsed.data)
        firmwareAddData(base, data.length, data)
        parsedCount++
        break
      }
      case HEX_TYPE_END_OF_FILE:
        break
      // Ignore other record types
    }
  }

  return parsedCount > 0
}

/**
 * Save firmware segments to Intel HEX content string.
 */
function hexSaveToFile(segments: FirmwareSegment[]): string {
  const lines: string[] = []
  let lastExtendedAddr = 0

  for (const seg of segments) {
    // Emit extended linear address record if needed
    const extAddr = (seg.base >>> 16) & 0xFFFF
    if (extAddr !== lastExtendedAddr) {
      lines.push(hexConstructLine(HEX_TYPE_EXT_LINEAR_ADDR, 0, new Uint8Array([
        (extAddr >> 8) & 0xFF,
        extAddr & 0xFF,
      ])))
      lastExtendedAddr = extAddr
    }

    // Write data in chunks of up to 16 bytes per line
    const CHUNK_SIZE = 16
    for (let offset = 0; offset < seg.length; offset += CHUNK_SIZE) {
      const chunkLen = Math.min(CHUNK_SIZE, seg.length - offset)
      const localAddr = (seg.base + offset) & 0xFFFF
      const chunk = seg.data.slice(offset, offset + chunkLen)
      lines.push(hexConstructLine(HEX_TYPE_DATA, localAddr, chunk))
    }
  }

  // End of file record
  lines.push(hexConstructLine(HEX_TYPE_END_OF_FILE, 0, new Uint8Array(0)))

  return lines.join('\n') + '\n'
}

/**
 * Construct an Intel HEX line.
 */
function hexConstructLine(type: number, address: number, data: Uint8Array): string {
  const byteCount = data.length
  let hexStr = ':'
  hexStr += byteCount.toString(16).padStart(2, '0').toUpperCase()
  hexStr += (address & 0xFFFF).toString(16).padStart(4, '0').toUpperCase()
  hexStr += type.toString(16).padStart(2, '0').toUpperCase()

  let sum = byteCount + ((address >> 8) & 0xFF) + (address & 0xFF) + type
  for (let i = 0; i < data.length; i++) {
    hexStr += data[i].toString(16).padStart(2, '0').toUpperCase()
    sum += data[i]
  }

  const checksum = (~sum + 1) & 0xFF
  hexStr += checksum.toString(16).padStart(2, '0').toUpperCase()

  return hexStr
}

// ── Export ───────────────────────────────────────────────────

/**
 * Parse a single Intel HEX line.
 * Exported for use by other modules (e.g., flashPlanner).
 * @returns Parsed record or null if invalid.
 */
export { hexParseLine as parseHexLine }

/** Intel HEX parser, implementing FirmwareParser interface. */
export const HexParser: FirmwareParser = {
  loadFromFile: hexLoadFromFile,
  saveToFile: hexSaveToFile,
}
