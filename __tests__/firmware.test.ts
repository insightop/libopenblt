import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  firmwareAddData,
  firmwareClearData,
  firmwareGetSegment,
  firmwareGetSegmentCount,
  firmwareInit,
  firmwareRemoveData,
  firmwareTerminate,
} from "../src/firmware.js";

describe("firmware module", () => {
  beforeEach(() => {
    firmwareInit();
  });

  afterEach(() => {
    firmwareTerminate();
  });

  describe("basic operations", () => {
    it("starts with 0 segments", () => {
      expect(firmwareGetSegmentCount()).toBe(0);
    });

    it("addData creates a segment", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03]);
      firmwareAddData(0x08000000, 3, data);
      expect(firmwareGetSegmentCount()).toBe(1);
    });

    it("getSegment returns correct data", () => {
      const data = new Uint8Array([0xaa, 0xbb]);
      firmwareAddData(0x1000, 2, data);
      const seg = firmwareGetSegment(0);
      expect(seg).not.toBeNull();
      expect(seg?.base).toBe(0x1000);
      expect(seg?.length).toBe(2);
      expect(seg?.data).toEqual(data);
    });

    it("getSegment returns null for invalid index", () => {
      expect(firmwareGetSegment(0)).toBeNull();
      expect(firmwareGetSegment(-1)).toBeNull();
    });

    it("clearData removes all segments", () => {
      firmwareAddData(0x1000, 4, new Uint8Array([1, 2, 3, 4]));
      firmwareClearData();
      expect(firmwareGetSegmentCount()).toBe(0);
    });
  });

  describe("address queries", () => {
    it("first and last addresses are derived from segments", () => {
      firmwareAddData(0x2000, 8, new Uint8Array(8));
      firmwareAddData(0x4000, 4, new Uint8Array(4));
      // first address = first segment base
      expect(firmwareGetSegment(0)?.base).toBe(0x2000);
      // last address = last segment base + length - 1
      const last = firmwareGetSegment(firmwareGetSegmentCount() - 1)!;
      expect(last.base + last.length - 1).toBe(0x4003);
    });
  });

  describe("segment merging", () => {
    it("merges adjacent segments", () => {
      firmwareAddData(0x1000, 4, new Uint8Array([1, 2, 3, 4]));
      firmwareAddData(0x1004, 4, new Uint8Array([5, 6, 7, 8]));
      expect(firmwareGetSegmentCount()).toBe(1);
      const seg = firmwareGetSegment(0)!;
      expect(seg.base).toBe(0x1000);
      expect(seg.length).toBe(8);
      expect(seg.data).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    });

    it("does not merge non-adjacent segments", () => {
      firmwareAddData(0x1000, 4, new Uint8Array([1, 2, 3, 4]));
      firmwareAddData(0x2000, 4, new Uint8Array([5, 6, 7, 8]));
      expect(firmwareGetSegmentCount()).toBe(2);
    });
  });

  describe("removeData", () => {
    it("removes data from middle of segment (splits)", () => {
      firmwareAddData(0x1000, 8, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
      firmwareRemoveData(0x1002, 4); // remove bytes 2-5
      expect(firmwareGetSegmentCount()).toBe(2);
      expect(firmwareGetSegment(0)?.data).toEqual(new Uint8Array([1, 2]));
      expect(firmwareGetSegment(1)?.data).toEqual(new Uint8Array([7, 8]));
    });

    it("removes data from start (trims)", () => {
      firmwareAddData(0x1000, 4, new Uint8Array([1, 2, 3, 4]));
      firmwareRemoveData(0x1000, 2);
      expect(firmwareGetSegmentCount()).toBe(1);
      expect(firmwareGetSegment(0)?.data).toEqual(new Uint8Array([3, 4]));
    });

    it("removes data from end (trims)", () => {
      firmwareAddData(0x1000, 4, new Uint8Array([1, 2, 3, 4]));
      firmwareRemoveData(0x1002, 2);
      expect(firmwareGetSegmentCount()).toBe(1);
      expect(firmwareGetSegment(0)?.data).toEqual(new Uint8Array([1, 2]));
    });
  });
});
