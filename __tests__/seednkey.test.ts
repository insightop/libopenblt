import { describe, expect, it } from "vitest";
import {
  SeedNKeyAlgorithm,
  seednkeyComputeKeyFromSeed,
  seednkeyGetAvailablePrivileges,
} from "../src/seednkey.js";
import {
  XCPPROTECT_RESOURCE_CALPAG,
  XCPPROTECT_RESOURCE_DAQ,
  XCPPROTECT_RESOURCE_PGM,
  XCPPROTECT_RESOURCE_STIM,
} from "../src/xcpprotect.js";

describe("seednkeyGetAvailablePrivileges", () => {
  it("returns PGM resource only (default OpenBLT algorithm)", () => {
    expect(seednkeyGetAvailablePrivileges()).toBe(XCPPROTECT_RESOURCE_PGM);
  });
});

describe("seednkeyComputeKeyFromSeed", () => {
  it("computes key as seed[i]-1 for PGM resource", () => {
    const seed = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const key = seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, seed);
    expect(key).toEqual(new Uint8Array([0xa9, 0xba, 0xcb]));
  });

  it("handles underflow with & 0xFF", () => {
    const seed = new Uint8Array([0x00]);
    const key = seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, seed);
    expect(key).toEqual(new Uint8Array([0xff]));
  });

  it("key length equals seed length", () => {
    const seed = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const key = seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, seed);
    expect(key.length).toBe(4);
  });

  it("throws for unsupported resources", () => {
    const seed = new Uint8Array([0x01]);
    expect(() => seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_STIM, seed)).toThrow();
    expect(() => seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_DAQ, seed)).toThrow();
    expect(() => seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_CALPAG, seed)).toThrow();
  });

  it("throws for empty seed", () => {
    expect(() => seednkeyComputeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, new Uint8Array(0))).toThrow();
  });
});

describe("SeedNKeyAlgorithm object", () => {
  it("implements XcpProtectAlgorithm interface", () => {
    expect(SeedNKeyAlgorithm.computeKeyFromSeed).toBe(seednkeyComputeKeyFromSeed);
    expect(SeedNKeyAlgorithm.getAvailablePrivileges).toBe(seednkeyGetAvailablePrivileges);
  });

  it("works through the algorithm interface", () => {
    const seed = new Uint8Array([0x10, 0x20]);
    const key = SeedNKeyAlgorithm.computeKeyFromSeed(XCPPROTECT_RESOURCE_PGM, seed);
    expect(key).toEqual(new Uint8Array([0x0f, 0x1f]));
    expect(SeedNKeyAlgorithm.getAvailablePrivileges()).toBe(XCPPROTECT_RESOURCE_PGM);
  });
});
