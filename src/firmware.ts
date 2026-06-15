/**
 * Firmware data module — aligns with libopenblt firmware.c / firmware.h.
 *
 * Manages firmware data as a collection of segments (contiguous address ranges).
 * Segments are sorted by ascending base address and merged when adjacent.
 *
 * The module provides functions to add, remove, and query firmware data,
 * and a pluggable parser interface for loading from files.
 */

// ── Types ────────────────────────────────────────────────────

/** Firmware data segment. Aligns with C tFirmwareSegment (without linked list pointers). */
export interface FirmwareSegment {
  /** Start memory address. */
  base: number;
  /** Number of data bytes. */
  length: number;
  /** Data bytes. */
  data: Uint8Array;
}

/** Firmware file parser interface. Aligns with C tFirmwareParser vtable. */
export interface FirmwareParser {
  /** Load firmware data from content string and add segments. */
  loadFromFile(content: string, addressOffset: number): boolean;
  /** Save firmware segments to a content string. */
  saveToFile(segments: FirmwareSegment[], filename?: string): string;
}

// ── Module State ─────────────────────────────────────────────

let segmentList: FirmwareSegment[] = [];
let parser_: FirmwareParser | null = null;

// ── API Functions (aligning with C Firmware* functions) ──────

/**
 * Initialize the firmware data module.
 * Aligns with C FirmwareInit.
 * @param parser Optional firmware file parser to link.
 */
export function firmwareInit(parser: FirmwareParser | null = null): void {
  parser_ = parser;
  segmentList = [];
}

/**
 * Terminate the firmware data module.
 * Aligns with C FirmwareTerminate.
 */
export function firmwareTerminate(): void {
  firmwareClearData();
  parser_ = null;
}

/**
 * Load firmware data from a file using the linked parser.
 * Aligns with C FirmwareLoadFromFile.
 */
export function firmwareLoadFromFile(content: string, addressOffset: number = 0): boolean {
  if (!parser_) return false;
  return parser_.loadFromFile(content, addressOffset);
}

/**
 * Save firmware data to a file using the linked parser.
 * Aligns with C FirmwareSaveToFile.
 */
export function firmwareSaveToFile(filename?: string): string | null {
  if (!parser_) return null;
  return parser_.saveToFile(segmentList, filename);
}

/**
 * Get the total number of firmware segments.
 * Aligns with C FirmwareGetSegmentCount.
 */
export function firmwareGetSegmentCount(): number {
  return segmentList.length;
}

/**
 * Get a firmware segment by index.
 * Aligns with C FirmwareGetSegment.
 * @returns The segment, or null if index is out of range.
 */
export function firmwareGetSegment(idx: number): FirmwareSegment | null {
  if (idx < 0 || idx >= segmentList.length) return null;
  return segmentList[idx];
}

/**
 * Add firmware data, creating or extending segments as needed.
 * Overlapping data is overwritten. Adjacent segments are merged.
 * Aligns with C FirmwareAddData.
 */
export function firmwareAddData(address: number, len: number, data: Uint8Array): boolean {
  if (len <= 0 || !data || data.length === 0) return false;

  // First remove any existing data in this range (to handle overlaps)
  firmwareRemoveData(address, len);

  // Create a new segment
  const newSegment: FirmwareSegment = {
    base: address,
    length: len,
    data: new Uint8Array(data),
  };
  segmentList.push(newSegment);

  // Sort and merge
  firmwareSortSegments();
  firmwareMergeSegments();

  return true;
}

/**
 * Remove firmware data from the specified range.
 * Segments are trimmed or split as needed.
 * Aligns with C FirmwareRemoveData.
 */
export function firmwareRemoveData(address: number, len: number): boolean {
  if (len <= 0) return false;
  if (segmentList.length === 0) return true;

  const addressEnd = address + len;

  // Check if range is outside all segments
  const firstAddr = segmentList[0].base;
  const lastSegment = segmentList[segmentList.length - 1];
  const lastAddr = lastSegment.base + lastSegment.length;

  if (addressEnd <= firstAddr || address >= lastAddr) {
    return true; // Nothing to remove
  }

  const newSegments: FirmwareSegment[] = [];

  for (const seg of segmentList) {
    const segEnd = seg.base + seg.length;

    // No overlap — keep segment as-is
    if (segEnd <= address || seg.base >= addressEnd) {
      newSegments.push(seg);
      continue;
    }

    // Segment completely within removal range — drop
    if (seg.base >= address && segEnd <= addressEnd) {
      continue;
    }

    // Removal range completely within segment — split
    if (seg.base < address && segEnd > addressEnd) {
      const leftLen = address - seg.base;
      const rightLen = segEnd - addressEnd;
      newSegments.push({ base: seg.base, length: leftLen, data: seg.data.slice(0, leftLen) });
      newSegments.push({
        base: addressEnd,
        length: rightLen,
        data: seg.data.slice(leftLen + (addressEnd - address)),
      });
      continue;
    }

    // Segment starts before removal, ends within removal — keep left part
    if (seg.base < address && segEnd <= addressEnd) {
      const newLen = address - seg.base;
      newSegments.push({ base: seg.base, length: newLen, data: seg.data.slice(0, newLen) });
      continue;
    }

    // Segment starts within removal, ends after — keep right part
    if (seg.base >= address && segEnd > addressEnd) {
      const newLen = segEnd - addressEnd;
      newSegments.push({
        base: addressEnd,
        length: newLen,
        data: seg.data.slice(seg.length - newLen),
      });
    }
  }

  segmentList = newSegments;
  firmwareSortSegments();
  return true;
}

/**
 * Clear all firmware data.
 * Aligns with C FirmwareClearData.
 */
export function firmwareClearData(): void {
  segmentList = [];
}

/**
 * Get the first memory address of firmware data.
 * Internal helper — aligns with C FirmwareGetFirstAddress (static).
 */
function _firmwareGetFirstAddress(): number {
  if (segmentList.length === 0) return 0;
  return segmentList[0].base;
}

/**
 * Get the last memory address of firmware data.
 * Internal helper — aligns with C FirmwareGetLastAddress (static).
 */
function _firmwareGetLastAddress(): number {
  if (segmentList.length === 0) return 0;
  const last = segmentList[segmentList.length - 1];
  return last.base + last.length - 1;
}

// ── Internal Helpers ─────────────────────────────────────────

/** Sort segments by ascending base address. */
function firmwareSortSegments(): void {
  segmentList.sort((a, b) => a.base - b.base);
}

/** Merge adjacent segments into one. */
function firmwareMergeSegments(): void {
  if (segmentList.length <= 1) return;

  const merged: FirmwareSegment[] = [segmentList[0]];

  for (let i = 1; i < segmentList.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segmentList[i];

    if (prev.base + prev.length === curr.base) {
      // Adjacent — merge
      const newData = new Uint8Array(prev.length + curr.length);
      newData.set(prev.data, 0);
      newData.set(curr.data, prev.length);
      prev.length += curr.length;
      prev.data = newData;
    } else {
      merged.push(curr);
    }
  }

  segmentList = merged;
}
