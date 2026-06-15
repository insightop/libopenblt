import { describe, expect, it } from "vitest";
import {
  utilChecksumCrc16Calculate,
  utilChecksumCrc32Calculate,
  utilCryptoAes256Decrypt,
  utilCryptoAes256Encrypt,
  utilTimeDelayMs,
  utilTimeGetSystemTimeMs,
} from "../src/util.js";

describe("utilChecksumCrc16Calculate", () => {
  it("returns 0 for empty data", () => {
    expect(utilChecksumCrc16Calculate(new Uint8Array(0))).toBe(0);
  });

  it("calculates CRC16 for known data", () => {
    // "123456789" with polynomial 0x8005, initial 0 → 0xFEE8
    const data = new TextEncoder().encode("123456789");
    expect(utilChecksumCrc16Calculate(data)).toBe(0xfee8);
  });

  it("produces deterministic results", () => {
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    const crc1 = utilChecksumCrc16Calculate(data);
    const crc2 = utilChecksumCrc16Calculate(data);
    expect(crc1).toBe(crc2);
  });
});

describe("utilChecksumCrc32Calculate", () => {
  it("returns 0 for empty data (no final XOR, initial 0)", () => {
    expect(utilChecksumCrc32Calculate(new Uint8Array(0))).toBe(0);
  });

  it('calculates CRC32 for "123456789" (non-reflected, polynomial 0x04C11DB7)', () => {
    const data = new TextEncoder().encode("123456789");
    expect(utilChecksumCrc32Calculate(data)).toBe(0x89a1897f);
  });
});

describe("utilTimeGetSystemTimeMs", () => {
  it("returns a positive number", () => {
    const t = utilTimeGetSystemTimeMs();
    expect(t).toBeGreaterThan(0);
  });

  it("returns roughly current time", () => {
    const before = Date.now();
    const t = utilTimeGetSystemTimeMs();
    const after = Date.now();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });
});

describe("utilTimeDelayMs", () => {
  it("resolves after approximately the specified delay", async () => {
    const start = Date.now();
    await utilTimeDelayMs(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow some tolerance
  });
});

describe("utilCryptoAes256Encrypt / Decrypt", () => {
  // Verified AES-256-ECB test vector (all-zero key and plaintext)
  const key = new Uint8Array(32); // all zeros
  const plaintext = new Uint8Array(16); // all zeros
  const expectedCiphertext = new Uint8Array([
    0xdc, 0x95, 0xc0, 0x78, 0xa2, 0x40, 0x89, 0x89, 0xad, 0x48, 0xa2, 0x14, 0x92, 0x84, 0x20, 0x87,
  ]);

  it("encrypts a single 16-byte block correctly", () => {
    const data = new Uint8Array(plaintext);
    const result = utilCryptoAes256Encrypt(data, key);
    expect(result).toEqual(expectedCiphertext);
  });

  it("decrypts a single 16-byte block correctly", () => {
    const data = new Uint8Array(expectedCiphertext);
    const result = utilCryptoAes256Decrypt(data, key);
    expect(result).toEqual(plaintext);
  });

  it("encrypt then decrypt round-trips", () => {
    const data = new Uint8Array(plaintext);
    utilCryptoAes256Encrypt(data, key);
    utilCryptoAes256Decrypt(data, key);
    expect(data).toEqual(plaintext);
  });

  it("processes multiple 16-byte blocks", () => {
    const data = new Uint8Array(32);
    data.set(plaintext, 0);
    data.set(plaintext, 16);
    utilCryptoAes256Encrypt(data, key);
    // Both blocks should be encrypted to the same ciphertext (ECB)
    expect(data.slice(0, 16)).toEqual(expectedCiphertext);
    expect(data.slice(16, 32)).toEqual(expectedCiphertext);
  });

  it("throws when data length is not a multiple of 16", () => {
    const data = new Uint8Array(15);
    expect(() => utilCryptoAes256Encrypt(data, key)).toThrow();
  });

  it("throws when key length is not 32", () => {
    const data = new Uint8Array(16);
    const badKey = new Uint8Array(16);
    expect(() => utilCryptoAes256Encrypt(data, badKey)).toThrow();
  });
});
