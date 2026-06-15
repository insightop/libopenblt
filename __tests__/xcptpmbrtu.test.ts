import { describe, expect, it } from "vitest";
import {
  XCP_TP_MBRTU_FCT_CODE_USER_XCP,
  xcpTpMbRtuBuildFrame,
  xcpTpMbRtuCrcCalculate,
  xcpTpMbRtuParseFrame,
} from "../src/xcptpmbrtu.js";

describe("xcpTpMbRtuCrcCalculate", () => {
  it("calculates CRC16 for a known Modbus frame", () => {
    // Minimal frame: [0x01, 0x6D, 0x01, 0xFF]
    const data = new Uint8Array([0x01, 0x6d, 0x01, 0xff]);
    const crc = xcpTpMbRtuCrcCalculate(data);
    // CRC should be a 16-bit value
    expect(crc).toBeGreaterThanOrEqual(0);
    expect(crc).toBeLessThanOrEqual(0xffff);
  });

  it("produces deterministic results", () => {
    const data = new Uint8Array([0x01, 0x6d, 0x03, 0xff, 0xfd, 0x00]);
    const crc1 = xcpTpMbRtuCrcCalculate(data);
    const crc2 = xcpTpMbRtuCrcCalculate(data);
    expect(crc1).toBe(crc2);
  });

  it("different data produces different CRC", () => {
    const data1 = new Uint8Array([0x01, 0x6d, 0x01, 0xff]);
    const data2 = new Uint8Array([0x01, 0x6d, 0x01, 0xfe]);
    expect(xcpTpMbRtuCrcCalculate(data1)).not.toBe(xcpTpMbRtuCrcCalculate(data2));
  });
});

describe("xcpTpMbRtuBuildFrame", () => {
  it("builds correct frame structure", () => {
    const xcpPacket = new Uint8Array([0xff, 0x00]); // CONNECT command
    const frame = xcpTpMbRtuBuildFrame(xcpPacket, 0x01);

    // slaveAddr + fc + len + xcpData + crc(2)
    expect(frame.length).toBe(3 + 2 + 2);
    expect(frame[0]).toBe(0x01); // slave address
    expect(frame[1]).toBe(XCP_TP_MBRTU_FCT_CODE_USER_XCP); // FC = 109
    expect(frame[2]).toBe(2); // XCP data length
    expect(frame[3]).toBe(0xff); // XCP data byte 0
    expect(frame[4]).toBe(0x00); // XCP data byte 1
  });

  it("uses default slave address when not specified", () => {
    const frame = xcpTpMbRtuBuildFrame(new Uint8Array([0xff]));
    expect(frame[0]).toBe(0x01);
  });

  it("CRC is valid — parseFrame round-trips successfully", () => {
    const xcpPacket = new Uint8Array([0xff, 0x00, 0xfd]);
    const frame = xcpTpMbRtuBuildFrame(xcpPacket, 0x05);
    const parsed = xcpTpMbRtuParseFrame(frame, 0x05);
    expect(parsed).toEqual(xcpPacket);
  });
});

describe("xcpTpMbRtuParseFrame", () => {
  it("parses valid frame and extracts XCP payload", () => {
    const xcpPacket = new Uint8Array([0xff, 0x01, 0x02, 0x03]);
    const frame = xcpTpMbRtuBuildFrame(xcpPacket, 0x01);
    const parsed = xcpTpMbRtuParseFrame(frame, 0x01);
    expect(parsed).toEqual(xcpPacket);
  });

  it("throws on too-short frame", () => {
    expect(() => xcpTpMbRtuParseFrame(new Uint8Array([0x01, 0x6d]))).toThrow("too short");
  });

  it("throws on slave address mismatch", () => {
    const frame = xcpTpMbRtuBuildFrame(new Uint8Array([0xff]), 0x01);
    expect(() => xcpTpMbRtuParseFrame(frame, 0x02)).toThrow("address mismatch");
  });

  it("throws on function code mismatch", () => {
    // Manually build a frame with wrong FC
    const badFrame = new Uint8Array([0x01, 0x03, 0x01, 0xff, 0x00, 0x00]);
    // Compute real CRC for bytes 0..2
    const crc = xcpTpMbRtuCrcCalculate(badFrame.subarray(0, 3));
    badFrame[4] = crc & 0xff;
    badFrame[5] = (crc >> 8) & 0xff;
    expect(() => xcpTpMbRtuParseFrame(badFrame, 0x01)).toThrow("function code");
  });

  it("throws on CRC mismatch", () => {
    const frame = xcpTpMbRtuBuildFrame(new Uint8Array([0xff]), 0x01);
    // Corrupt the last byte (CRC high)
    frame[frame.length - 1] ^= 0xff;
    expect(() => xcpTpMbRtuParseFrame(frame, 0x01)).toThrow("CRC mismatch");
  });
});
