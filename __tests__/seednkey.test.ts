import { describe, it, expect } from 'vitest'
import {
  seednkeyComputeKeyFromSeed,
  seednkeyGetAvailablePrivileges,
  SeedNKeyAlgorithm,
} from '../src/seednkey.js'
import {
  XCPPROTECT_RESOURCE_PGM,
  XCPPROTECT_RESOURCE_STIM,
  XCPPROTECT_RESOURCE_DAQ,
  XCPPROTECT_RESOURCE_CALPAG,
} from '../src/xcpprotect.js'

describe('seednkeyGetAvailablePrivileges', () => {
  it('returns PGM resource only (default OpenBLT algorithm)', () => {
    expect(seednkeyGetAvailablePrivileges()).toBe(XCPPROTECT_RESOURCE_PGM)
  })
})

describe('seednkeyComputeKeyFromSeed', () => {
  it('computes key as seed[i]-1 for PGM resource', () => {
    const seed = new Uint8Array([0xAA, 0xBB, 0xCC])
    const key = seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, seed)
    expect(key).toEqual(new Uint8Array([0xA9, 0xBA, 0xCB]))
  })

  it('handles underflow with & 0xFF', () => {
    const seed = new Uint8Array([0x00])
    const key = seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, seed)
    expect(key).toEqual(new Uint8Array([0xFF]))
  })

  it('key length equals seed length', () => {
    const seed = new Uint8Array([0x01, 0x02, 0x03, 0x04])
    const key = seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, seed)
    expect(key.length).toBe(4)
  })

  it('throws for unsupported resources', () => {
    const seed = new Uint8Array([0x01])
    expect(() => seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_STIM, seed)).toThrow()
    expect(() => seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_DAQ, seed)).toThrow()
    expect(() => seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_CALPAG, seed)).toThrow()
  })

  it('throws for empty seed', () => {
    expect(() => seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, new Uint8Array(0))).toThrow()
  })
})

describe('SeedNKeyAlgorithm object', () => {
  it('implements XcpProtectAlgorithm interface', () => {
    expect(SeedNKeyAlgorithm.computeKeyFromSeed).toBe(seednkeyComputeKeyFromSeed)
    expect(SeedNKeyAlgorithm.getAvailablePrivileges).toBe(seednkeyGetAvailablePrivileges)
  })

  it('works through the algorithm interface', () => {
    const seed = new Uint8Array([0x10, 0x20])
    const key = SeedNKeyAlgorithm.computeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, seed)
    expect(key).toEqual(new Uint8Array([0x0F, 0x1F]))
    expect(SeedNKeyAlgorithm.getAvailablePrivileges()).toBe(XCPPROTECT_RESOURCE_PGM)
  })
})
