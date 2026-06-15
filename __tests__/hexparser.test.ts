import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { firmwareInit, firmwareTerminate, firmwareGetSegmentCount, firmwareGetSegment, firmwareClearData, firmwareAddData } from '../src/firmware.js'
import { SRecParser } from '../src/srecparser.js'
import { HexParser } from '../src/hexparser.js'

// ── S-Record Parser Tests ────────────────────────────────────

describe('SRecParser', () => {
  beforeEach(() => {
    firmwareInit(SRecParser)
  })

  afterEach(() => {
    firmwareTerminate()
  })

  it('loads S1 data records', () => {
    const segments = [{ base: 0x1000, length: 3, data: new Uint8Array([0x01, 0x02, 0x03]) }]
    const srecContent = SRecParser.saveToFile(segments)

    firmwareClearData()
    const result = SRecParser.loadFromFile(srecContent, 0)
    expect(result).toBe(true)
    expect(result).toBe(true)
    expect(firmwareGetSegmentCount()).toBe(1)
    const seg = firmwareGetSegment(0)!
    expect(seg.base).toBe(0x1000)
    expect(seg.data).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('round-trips save → load', () => {
    const data = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD])
    firmwareAddData(0x2000, 4, data)

    const output = SRecParser.saveToFile([firmwareGetSegment(0)!])
    firmwareClearData()

    SRecParser.loadFromFile(output, 0)
    const seg = firmwareGetSegment(0)!
    expect(seg.base).toBe(0x2000)
    expect(seg.data).toEqual(data)
  })

  it('applies address offset', () => {
    const segments = [{ base: 0x1000, length: 2, data: new Uint8Array([0x01, 0x02]) }]
    const content = SRecParser.saveToFile(segments)
    firmwareClearData()

    SRecParser.loadFromFile(content, 0x3000)
    const seg = firmwareGetSegment(0)!
    expect(seg.base).toBe(0x4000) // 0x1000 + 0x3000
  })
})

// ── Intel HEX Parser Tests ───────────────────────────────────

describe('HexParser', () => {
  beforeEach(() => {
    firmwareInit(HexParser)
  })

  afterEach(() => {
    firmwareTerminate()
  })

  it('round-trips save → load', () => {
    const data = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD])
    firmwareAddData(0x1000, 4, data)

    const output = HexParser.saveToFile([firmwareGetSegment(0)!])
    firmwareClearData()

    const result = HexParser.loadFromFile(output, 0)
    expect(result).toBe(true)
    const seg = firmwareGetSegment(0)!
    expect(seg.base).toBe(0x1000)
    expect(seg.data).toEqual(data)
  })

  it('handles multiple segments', () => {
    firmwareAddData(0x1000, 2, new Uint8Array([0x01, 0x02]))
    firmwareAddData(0x3000, 2, new Uint8Array([0x03, 0x04]))

    const output = HexParser.saveToFile([
      firmwareGetSegment(0)!,
      firmwareGetSegment(1)!,
    ])
    firmwareClearData()

    HexParser.loadFromFile(output, 0)
    expect(firmwareGetSegmentCount()).toBe(2)
    expect(firmwareGetSegment(0)!.base).toBe(0x1000)
    expect(firmwareGetSegment(1)!.base).toBe(0x3000)
  })

  it('applies address offset', () => {
    const segments = [{ base: 0x1000, length: 2, data: new Uint8Array([0x01, 0x02]) }]
    const content = HexParser.saveToFile(segments)
    firmwareClearData()

    HexParser.loadFromFile(content, 0x2000)
    const seg = firmwareGetSegment(0)!
    expect(seg.base).toBe(0x3000)
  })

  it('output contains extended linear address for high addresses', () => {
    firmwareAddData(0x08000000, 2, new Uint8Array([0x01, 0x02]))
    const output = HexParser.saveToFile([firmwareGetSegment(0)!])
    // Should contain type 04 record (extended linear address)
    expect(output).toContain('04')
    expect(output).toContain(':00000001FF')  // EOF record
  })
})
