/**
 * Motorola S-Record parser — aligns with libopenblt srecparser.c / srecparser.h.
 *
 * Parses Motorola S-record format files (S1/S2/S3 data records, S7/S8/S9 termination).
 * The parser adds firmware data to the firmware module via firmwareAddData.
 *
 * S-Record line format: S[Type][ByteCount][Address][Data][Checksum]
 *   - S0: Header record (ignored)
 *   - S1: 16-bit address data record
 *   - S2: 24-bit address data record
 *   - S3: 32-bit address data record
 *   - S7: 32-bit start address (termination)
 *   - S8: 24-bit start address (termination)
 *   - S9: 16-bit start address (termination)
 *
 * Checksum: two's complement of sum of all bytes after 'S' and before checksum.
 */

import { type FirmwareParser, type FirmwareSegment, firmwareAddData } from "./firmware.js";

// ── S-Record Line Types (matching C enum) ────────────────────

const SREC_LINE_TYPE_S0 = 0;
const SREC_LINE_TYPE_S1 = 1;
const SREC_LINE_TYPE_S2 = 2;
const SREC_LINE_TYPE_S3 = 3;
const SREC_LINE_TYPE_S7 = 7;
const SREC_LINE_TYPE_S8 = 8;
const SREC_LINE_TYPE_S9 = 9;

// ── Parser Implementation ────────────────────────────────────

/**
 * Parse a hex string pair (2 chars) to a byte value.
 * Aligns with C SRecParserHexStringToByte.
 */
function hexStringToByte(hex: string): number {
  return parseInt(hex, 16) & 0xff;
}

/**
 * Get the S-record line type from the first two characters.
 * Aligns with C SRecParserGetLineType.
 */
function getLineType(line: string): number {
  if (line.length < 2) return -1;
  if (line[0] !== "S" && line[0] !== "s") return -1;
  const typeChar = line[1];
  if (typeChar >= "0" && typeChar <= "9") return parseInt(typeChar, 10);
  return -1;
}

/**
 * Verify the checksum of an S-record line.
 * Aligns with C SRecParserVerifyChecksum.
 */
function verifyChecksum(line: string): boolean {
  if (line.length < 4) return false;

  const byteCount = hexStringToByte(line.substring(2, 4));
  // Line format: Sx(2) + byteCountHex(2) + dataHex(byteCount*2) = 4 + byteCount*2
  const expectedLen = 4 + byteCount * 2;
  if (expectedLen > line.length) return false;

  // Sum all bytes from bytecount through last data byte (excluding checksum at end)
  let sum = 0;
  for (let i = 2; i < 2 + byteCount * 2; i += 2) {
    sum += hexStringToByte(line.substring(i, i + 2));
  }

  // Checksum verification: checksum byte should equal one's complement of sum.
  // Aligns with C SRecParserVerifyChecksum: checksumVal = ~checksumVal; checksum == checksumVal
  const checksumByte = hexStringToByte(line.substring(2 + byteCount * 2, 4 + byteCount * 2));
  return checksumByte === (~sum & 0xff);
}

/**
 * Extract address and data from an S1/S2/S3 record.
 * Aligns with C SRecParserExtractLineData.
 *
 * @returns Object with address and data, or null on error.
 */
function extractLineData(line: string): { address: number; data: Uint8Array } | null {
  const lineType = getLineType(line);
  if (lineType < SREC_LINE_TYPE_S1 || lineType > SREC_LINE_TYPE_S3) return null;

  const byteCount = hexStringToByte(line.substring(2, 4));

  // Address length depends on record type
  let addrLen: number;
  switch (lineType) {
    case SREC_LINE_TYPE_S1:
      addrLen = 2;
      break; // 16-bit address
    case SREC_LINE_TYPE_S2:
      addrLen = 3;
      break; // 24-bit address
    case SREC_LINE_TYPE_S3:
      addrLen = 4;
      break; // 32-bit address
    default:
      return null;
  }

  // byteCount = addrLen + dataLen + 1 (checksum)
  const dataLen = byteCount - addrLen - 1;
  if (dataLen < 0) return null;

  // Extract address
  let address = 0;
  for (let i = 0; i < addrLen; i++) {
    address = (address << 8) | hexStringToByte(line.substring(4 + i * 2, 6 + i * 2));
  }

  // Extract data
  const data = new Uint8Array(dataLen);
  for (let i = 0; i < dataLen; i++) {
    data[i] = hexStringToByte(line.substring(4 + addrLen * 2 + i * 2, 6 + addrLen * 2 + i * 2));
  }

  return { address, data };
}

// ── FirmwareParser Implementation ────────────────────────────

/**
 * Load firmware from S-Record content string.
 * Aligns with C SRecParserLoadFromFile: verifies file first via SRecParserVerifyFile,
 * then extracts data records. Rejects the entire file on any checksum error.
 */
function srecLoadFromFile(content: string, addressOffset: number): boolean {
  const lines = content.split(/\r?\n/);

  // Pre-verification pass — aligns with C SRecParserVerifyFile.
  // Check all data record checksums and verify at least one data record exists.
  let hasDataRecord = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const lineType = getLineType(line);
    if (lineType < 0) continue;

    if (lineType >= SREC_LINE_TYPE_S1 && lineType <= SREC_LINE_TYPE_S3) {
      hasDataRecord = true;
      if (!verifyChecksum(line)) return false;
    }
  }
  if (!hasDataRecord) return false;

  // Data extraction pass
  let parsedCount = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const lineType = getLineType(line);
    if (lineType < 0) continue;

    // Only process data records (S1, S2, S3)
    if (lineType >= SREC_LINE_TYPE_S1 && lineType <= SREC_LINE_TYPE_S3) {
      const extracted = extractLineData(line);
      if (extracted) {
        const address = extracted.address + addressOffset;
        if (!firmwareAddData(address, extracted.data.length, extracted.data)) {
          return false;
        }
        parsedCount++;
      }
    }
  }

  return parsedCount > 0;
}

/**
 * Save firmware segments to S-Record content string.
 * Aligns with C SRecParserSaveToFile: dynamically selects S1/S2/S3 based on address range.
 */
function srecSaveToFile(segments: FirmwareSegment[], filename?: string): string {
  const lines: string[] = [];

  // S0 header record — write filename if provided (aligns with C UtilFileExtractFilename)
  const s0Data = filename
    ? new Uint8Array([...filename].map((c) => c.charCodeAt(0) & 0xff))
    : new Uint8Array(0);
  lines.push(srecConstructLine(SREC_LINE_TYPE_S0, 0, s0Data));

  // Determine line type based on highest address (aligns with C SRecParserSaveToFile)
  const maxAddr =
    segments.length > 0
      ? segments[segments.length - 1].base + segments[segments.length - 1].length - 1
      : 0;
  const dataLineType =
    maxAddr > 0xffffff
      ? SREC_LINE_TYPE_S3
      : maxAddr > 0xffff
        ? SREC_LINE_TYPE_S2
        : SREC_LINE_TYPE_S1;
  const termLineType =
    maxAddr > 0xffffff
      ? SREC_LINE_TYPE_S7
      : maxAddr > 0xffff
        ? SREC_LINE_TYPE_S8
        : SREC_LINE_TYPE_S9;

  // Data records
  for (const seg of segments) {
    // Write data in chunks of up to 32 bytes per line
    const CHUNK_SIZE = 32;
    for (let offset = 0; offset < seg.length; offset += CHUNK_SIZE) {
      const chunkLen = Math.min(CHUNK_SIZE, seg.length - offset);
      const chunk = seg.data.slice(offset, offset + chunkLen);
      lines.push(srecConstructLine(dataLineType, seg.base + offset, chunk));
    }
  }

  // Termination record
  lines.push(
    srecConstructLine(termLineType, segments.length > 0 ? segments[0].base : 0, new Uint8Array(0)),
  );

  return `${lines.join("\n")}\n`;
}

/**
 * Construct an S-record line.
 * Aligns with C SRecParserConstructLine.
 */
function srecConstructLine(lineType: number, address: number, data: Uint8Array): string {
  // Determine address length based on line type
  let addrLen: number;
  switch (lineType) {
    case SREC_LINE_TYPE_S0:
    case SREC_LINE_TYPE_S1:
    case SREC_LINE_TYPE_S9:
      addrLen = 2;
      break;
    case SREC_LINE_TYPE_S2:
    case SREC_LINE_TYPE_S8:
      addrLen = 3;
      break;
    case SREC_LINE_TYPE_S3:
    case SREC_LINE_TYPE_S7:
      addrLen = 4;
      break;
    default:
      addrLen = 4;
  }

  const byteCount = addrLen + data.length + 1; // +1 for checksum

  let hexStr = `S${lineType.toString()}${byteCount.toString(16).padStart(2, "0").toUpperCase()}`;

  // Address (big-endian)
  for (let i = addrLen - 1; i >= 0; i--) {
    hexStr += ((address >> (i * 8)) & 0xff).toString(16).padStart(2, "0").toUpperCase();
  }

  // Data
  for (let i = 0; i < data.length; i++) {
    hexStr += data[i].toString(16).padStart(2, "0").toUpperCase();
  }

  // Checksum
  let sum = 0;
  for (let i = 2; i < hexStr.length; i += 2) {
    sum += parseInt(hexStr.substring(i, i + 2), 16);
  }
  const checksum = ~sum & 0xff;
  hexStr += checksum.toString(16).padStart(2, "0").toUpperCase();

  return hexStr;
}

// ── Export ───────────────────────────────────────────────────

/** S-Record parser, implementing FirmwareParser interface. */
export const SRecParser: FirmwareParser = {
  loadFromFile: srecLoadFromFile,
  saveToFile: srecSaveToFile,
};
