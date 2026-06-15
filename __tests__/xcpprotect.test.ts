import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  XCPPROTECT_RESOURCE_PGM,
  XCPPROTECT_RESOURCE_STIM,
  XCPPROTECT_RESOURCE_DAQ,
  XCPPROTECT_RESOURCE_CALPAG,
  xcpProtectInit,
  xcpProtectTerminate,
  xcpProtectGetPrivileges,
  xcpProtectComputeKeyFromSeed,
} from '../src/xcpprotect.js'
import { SeedNKeyAlgorithm } from '../src/seednkey.js'

describe('xcpprotect constants', () => {
  it('PGM is 0x10', () => {
    expect(XCPPROTECT_RESOURCE_PGM).toBe(0x10)
  })

  it('STIM is 0x08', () => {
    expect(XCPPROTECT_RESOURCE_STIM).toBe(0x08)
  })

  it('DAQ is 0x04', () => {
    expect(XCPPROTECT_RESOURCE_DAQ).toBe(0x04)
  })

  it('CALPAG is 0x01', () => {
    expect(XCPPROTECT_RESOURCE_CALPAG).toBe(0x01)
  })
})

describe('xcpProtect module lifecycle', () => {
  afterEach(() => {
    xcpProtectTerminate()
  })

  it('getPrivileges returns 0 before init', () => {
    xcpProtectTerminate()
    expect(xcpProtectGetPrivileges()).toBe(0)
  })

  it('getPrivileges returns PGM after init (default algorithm)', () => {
    xcpProtectInit()
    expect(xcpProtectGetPrivileges()).toBe(XCPPROTECT_RESOURCE_PGM)
  })

  it('getPrivileges returns 0 after terminate', () => {
    xcpProtectInit()
    xcpProtectTerminate()
    expect(xcpProtectGetPrivileges()).toBe(0)
  })

  it('accepts custom algorithm', () => {
    const custom = {
      computeKeyFromSeed: (_r: number, seed: Uint8Array) => seed,
      getAvailablePrivileges: () => XCPPROTECT_RESOURCE_STIM,
    }
    xcpProtectInit(custom)
    expect(xcpProtectGetPrivileges()).toBe(XCPPROTECT_RESOURCE_STIM)
  })
})

describe('xcpProtectComputeKeyFromSeed', () => {
  afterEach(() => {
    xcpProtectTerminate()
  })

  it('throws before init', () => {
    xcpProtectTerminate()
    expect(() =>
      xcpProtectComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, new Uint8Array([1, 2, 3])),
    ).toThrow('not initialized')
  })

  it('throws for invalid resource (default algorithm)', () => {
    xcpProtectInit()
    expect(() =>
      xcpProtectComputeKeyFromSeed(0xFF, new Uint8Array([1, 2, 3])),
    ).toThrow('No key algorithm')
  })

  it('computes key as seed[i]-1 for PGM resource (default algorithm)', () => {
    xcpProtectInit()
    const seed = new Uint8Array([0xAA, 0xBB, 0xCC])
    const key = xcpProtectComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, seed)
    expect(key).toEqual(new Uint8Array([0xA9, 0xBA, 0xCB]))
  })

  it('only accepts PGM resource (default algorithm)', () => {
    xcpProtectInit()
    const seed = new Uint8Array([0x01])

    expect(() => xcpProtectComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, seed)).not.toThrow()
    expect(() => xcpProtectComputeKeyFromSeed(XCPPROTECT_RESOURCE_STIM, seed)).toThrow('No key algorithm')
    expect(() => xcpProtectComputeKeyFromSeed(XCPPROTECT_RESOURCE_DAQ, seed)).toThrow('No key algorithm')
    expect(() => xcpProtectComputeKeyFromSeed(XCPPROTECT_RESOURCE_CALPAG, seed)).toThrow('No key algorithm')
  })

  it('delegates to injected algorithm', () => {
    const custom = {
      computeKeyFromSeed: (_r: number, seed: Uint8Array) => new Uint8Array([0xFF]),
      getAvailablePrivileges: () => 0x1C, // PGM | STIM | DAQ
    }
    xcpProtectInit(custom)
    const key = xcpProtectComputeKeyFromSeed(XCPPROTECT_RESOURCE_STIM, new Uint8Array([1]))
    expect(key).toEqual(new Uint8Array([0xFF]))
  })
})
