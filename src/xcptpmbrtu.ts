/**
 * XCP Modbus RTU transport layer — aligns with libopenblt xcptpmbrtu.c / xcptpmbrtu.h.
 *
 * Embeds XCP packets inside Modbus RTU frames using user-defined function code 109.
 * Frame format:
 *   TX: [SlaveAddr(1)] [FC=109(1)] [XcpLen(1)] [XcpData(n)] [CRC_Lo(1)] [CRC_Hi(1)]
 *   RX: [SlaveAddr(1)] [FC=109(1)] [XcpLen(1)] [XcpData(m)] [CRC_Lo(1)] [CRC_Hi(1)]
 *
 * Also provides Modbus FC06 (Write Single Register) for auxiliary register writes.
 */

import {
  type SerialPort,
  SerialPortBaudrate,
  type SerialPortParity,
  SerialPortStopbits,
} from "./serialport.js";
import type { XcpTransport } from "./xcploader.js";

// ── Constants (matching C xcptpmbrtu.c macros) ───────────────

/** User-defined Modbus function code for XCP embedding (109 = 0x6D). */
export const XCP_TP_MBRTU_FCT_CODE_USER_XCP = 109;

/** Default slave/destination address. */
export const XCP_TP_MBRTU_DEFAULT_ADDR = 1;

// ── CRC16 — Modbus RTU specific (polynomial 0xA001) ──────────
// NOTE: This is DIFFERENT from util.ts CRC16 (polynomial 0x8005).
// Modbus RTU uses reflected polynomial 0xA001 with initial value 0xFFFF.

/** CRC16 high-byte lookup table (Modbus RTU). */
const CRCHi: readonly number[] = [
  0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41, 0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40,
  0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40, 0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41,
  0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40, 0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41,
  0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41, 0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40,
  0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40, 0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41,
  0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41, 0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40,
  0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41, 0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40,
  0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40, 0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41,
  0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40, 0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41,
  0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41, 0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40,
  0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41, 0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40,
  0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40, 0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41,
  0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41, 0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40,
  0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40, 0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41,
  0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40, 0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41,
  0x00, 0xc1, 0x81, 0x40, 0x01, 0xc0, 0x80, 0x41, 0x01, 0xc0, 0x80, 0x41, 0x00, 0xc1, 0x81, 0x40,
];

/** CRC16 low-byte lookup table (Modbus RTU). */
const CRCLo: readonly number[] = [
  0x00, 0xc0, 0xc1, 0x01, 0xc3, 0x03, 0x02, 0xc2, 0xc6, 0x06, 0x07, 0xc7, 0x05, 0xc5, 0xc4, 0x04,
  0xcc, 0x0c, 0x0d, 0xcd, 0x0f, 0xcf, 0xce, 0x0e, 0x0a, 0xca, 0xcb, 0x0b, 0xc9, 0x09, 0x08, 0xc8,
  0xd8, 0x18, 0x19, 0xd9, 0x1b, 0xdb, 0xda, 0x1a, 0x1e, 0xde, 0xdf, 0x1f, 0xdd, 0x1d, 0x1c, 0xdc,
  0x14, 0xd4, 0xd5, 0x15, 0xd7, 0x17, 0x16, 0xd6, 0xd2, 0x12, 0x13, 0xd3, 0x11, 0xd1, 0xd0, 0x10,
  0xf0, 0x30, 0x31, 0xf1, 0x33, 0xf3, 0xf2, 0x32, 0x36, 0xf6, 0xf7, 0x37, 0xf5, 0x35, 0x34, 0xf4,
  0x3c, 0xfc, 0xfd, 0x3d, 0xff, 0x3f, 0x3e, 0xfe, 0xfa, 0x3a, 0x3b, 0xfb, 0x39, 0xf9, 0xf8, 0x38,
  0x28, 0xe8, 0xe9, 0x29, 0xeb, 0x2b, 0x2a, 0xea, 0xee, 0x2e, 0x2f, 0xef, 0x2d, 0xed, 0xec, 0x2c,
  0xe4, 0x24, 0x25, 0xe5, 0x27, 0xe7, 0xe6, 0x26, 0x22, 0xe2, 0xe3, 0x23, 0xe1, 0x21, 0x20, 0xe0,
  0xa0, 0x60, 0x61, 0xa1, 0x63, 0xa3, 0xa2, 0x62, 0x66, 0xa6, 0xa7, 0x67, 0xa5, 0x65, 0x64, 0xa4,
  0x6c, 0xac, 0xad, 0x6d, 0xaf, 0x6f, 0x6e, 0xae, 0xaa, 0x6a, 0x6b, 0xab, 0x69, 0xa9, 0xa8, 0x68,
  0x78, 0xb8, 0xb9, 0x79, 0xbb, 0x7b, 0x7a, 0xba, 0xbe, 0x7e, 0x7f, 0xbf, 0x7d, 0xbd, 0xbc, 0x7c,
  0xb4, 0x74, 0x75, 0xb5, 0x77, 0xb7, 0xb6, 0x76, 0x72, 0xb2, 0xb3, 0x73, 0xb1, 0x71, 0x70, 0xb0,
  0x50, 0x90, 0x91, 0x51, 0x93, 0x53, 0x52, 0x92, 0x96, 0x56, 0x57, 0x97, 0x55, 0x95, 0x94, 0x54,
  0x9c, 0x5c, 0x5d, 0x9d, 0x5f, 0x9f, 0x9e, 0x5e, 0x5a, 0x9a, 0x9b, 0x5b, 0x99, 0x59, 0x58, 0x98,
  0x88, 0x48, 0x49, 0x89, 0x4b, 0x8b, 0x8a, 0x4a, 0x4e, 0x8e, 0x8f, 0x4f, 0x8d, 0x4d, 0x4c, 0x8c,
  0x44, 0x84, 0x85, 0x45, 0x87, 0x47, 0x46, 0x86, 0x82, 0x42, 0x43, 0x83, 0x41, 0x81, 0x80, 0x40,
];

/**
 * Calculate Modbus RTU CRC16.
 * Aligns with xcptpmbrtu.c XcpTpMbRtuCrcCalculate.
 * Polynomial: reflected 0xA001, initial: 0xFFFF.
 */
export function xcpTpMbRtuCrcCalculate(data: Uint8Array): number {
  let locCRCHi = 0xff;
  let locCRCLo = 0xff;

  for (let i = 0; i < data.length; i++) {
    const idx = (locCRCLo ^ data[i]) & 0xff;
    locCRCLo = locCRCHi ^ CRCHi[idx];
    locCRCHi = CRCLo[idx];
  }

  return (locCRCHi << 8) | locCRCLo;
}

// ── Modbus RTU Frame Construction/Parsing ────────────────────

/**
 * Build a Modbus RTU request frame for XCP-over-Modbus.
 * Aligns with xcptpmbrtu.c packet construction in XcpTpMbRtuSendPacket.
 *
 * Frame: [slaveAddr] [FC=109] [xcpLen] [xcpData...] [CRC_Lo] [CRC_Hi]
 */
export function xcpTpMbRtuBuildFrame(
  xcpPacket: Uint8Array,
  slaveAddr: number = XCP_TP_MBRTU_DEFAULT_ADDR,
): Uint8Array {
  const frameLen = 3 + xcpPacket.length + 2; // slaveAddr + fc + len + xcpData + crc
  const frame = new Uint8Array(frameLen);

  frame[0] = slaveAddr;
  frame[1] = XCP_TP_MBRTU_FCT_CODE_USER_XCP;
  frame[2] = xcpPacket.length;
  frame.set(xcpPacket, 3);

  // CRC covers slaveAddr through xcpData
  const crc = xcpTpMbRtuCrcCalculate(frame.subarray(0, 3 + xcpPacket.length));
  frame[frameLen - 2] = crc & 0xff; // CRC Low
  frame[frameLen - 1] = (crc >>> 8) & 0xff; // CRC High

  return frame;
}

/**
 * Parse a Modbus RTU response frame and validate CRC.
 * Aligns with xcptpmbrtu.c response validation in XcpTpMbRtuSendPacket.
 *
 * @returns The XCP payload extracted from the frame.
 * @throws On invalid frame length, address mismatch, FC mismatch, or CRC error.
 */
export function xcpTpMbRtuParseFrame(
  raw: Uint8Array,
  expectedSlaveAddr: number = XCP_TP_MBRTU_DEFAULT_ADDR,
): Uint8Array {
  if (raw.length < 5) {
    throw new Error(`Modbus frame too short: ${raw.length} bytes (min 5)`);
  }

  const slaveAddr = raw[0];
  const functionCode = raw[1];
  const xcpLen = raw[2];

  if (slaveAddr !== expectedSlaveAddr) {
    throw new Error(`Slave address mismatch: expected ${expectedSlaveAddr}, got ${slaveAddr}`);
  }

  if (functionCode !== XCP_TP_MBRTU_FCT_CODE_USER_XCP) {
    throw new Error(
      `Unexpected function code: 0x${functionCode.toString(16)} (expected 0x${XCP_TP_MBRTU_FCT_CODE_USER_XCP.toString(16)})`,
    );
  }

  const expectedLen = 3 + xcpLen + 2;
  if (raw.length !== expectedLen) {
    throw new Error(`Frame length mismatch: expected ${expectedLen}, got ${raw.length}`);
  }

  // Validate CRC
  const crcReceived = raw[raw.length - 2] | (raw[raw.length - 1] << 8);
  const crcComputed = xcpTpMbRtuCrcCalculate(raw.subarray(0, raw.length - 2));
  if (crcReceived !== crcComputed) {
    throw new Error(
      `CRC mismatch: received 0x${crcReceived.toString(16)}, computed 0x${crcComputed.toString(16)}`,
    );
  }

  return raw.slice(3, 3 + xcpLen);
}

// ── XcpTransport Implementation ──────────────────────────────

/** Settings for XcpTpMbRtu transport. Aligns with C tXcpTpMbRtuSettings. */
export interface XcpTpMbRtuSettings {
  /** Serial port driver to use for byte-level I/O. */
  serialPort: SerialPort;
  /** Port name (e.g., "/dev/ttyUSB0", "COM3"). */
  portName: string;
  /** Baud rate in bits/sec. */
  baudrate: number;
  /** Parity: 0=none, 1=odd, 2=even. */
  parity: number;
  /** Stop bits: 1 or 2. */
  stopbits: number;
  /** Destination slave address (1–247). */
  destinationAddr: number;
}

/** Maximum XCP packet size (matching C XCPLOADER_PACKET_SIZE_MAX). */
const XCPLOADER_PACKET_SIZE_MAX = 255;

/**
 * XCP Modbus RTU transport layer.
 * Aligns with xcptpmbrtu.c XcpTpMbRtu* functions.
 *
 * Implements the XcpTransport interface for use with XcpLoader.
 */
export class XcpTpMbRtu implements XcpTransport {
  private settings_: XcpTpMbRtuSettings | null = null;
  private connected_ = false;

  /** T3.5 character time in ms. Default 3ms for >19200 bps. */
  private t3_5Ms = 3;

  get connected(): boolean {
    return this.connected_;
  }

  /**
   * Initialize the transport layer.
   * Aligns with xcptpmbrtu.c XcpTpMbRtuInit.
   */
  init(settings: XcpTpMbRtuSettings): void {
    this.settings_ = { ...settings };

    // Calculate T3.5 character time — aligns with C xcptpmbrtu.c:162
    if (settings.baudrate <= 19200) {
      this.t3_5Ms = Math.ceil(38500 / settings.baudrate) + 1;
    } else {
      this.t3_5Ms = 3; // Fixed 3ms for high baudrates
    }
  }

  /**
   * Terminate the transport layer.
   * Aligns with xcptpmbrtu.c XcpTpMbRtuTerminate.
   */
  terminate(): void {
    this.disconnect();
    this.settings_ = null;
  }

  /**
   * Connect to the serial port and wait for idle line (T3.5).
   * Aligns with xcptpmbrtu.c XcpTpMbRtuConnect: actively drains stale bytes
   * and resets the T3.5 idle timer on each received byte.
   */
  async connect(): Promise<boolean> {
    if (!this.settings_) throw new Error("Transport not initialized");

    const { serialPort, portName } = this.settings_;
    const baudrateEnum = mapBaudrate(this.settings_.baudrate);

    const result = await serialPort.open(
      portName,
      baudrateEnum,
      this.settings_.parity as SerialPortParity,
      this.settings_.stopbits === 2 ? SerialPortStopbits.TWO : SerialPortStopbits.ONE,
    );
    if (!result) return false;

    // Drain stale bytes and wait for T3.5 idle (aligns with C XcpTpMbRtuConnect)
    const deadline = Date.now() + 500;
    let lastByteTime = Date.now();
    while (Date.now() - lastByteTime < this.t3_5Ms && Date.now() < deadline) {
      try {
        const buf = await serialPort.read(1);
        if (buf.length > 0) {
          lastByteTime = Date.now();
        }
      } catch {
        break;
      }
    }

    // Aligns with C XcpTpMbRtuConnect: close port and return false if timeout exceeded
    if (Date.now() >= deadline) {
      serialPort.close();
      return false;
    }

    this.connected_ = true;
    return true;
  }

  /**
   * Disconnect from the serial port.
   * Aligns with xcptpmbrtu.c XcpTpMbRtuDisconnect.
   */
  disconnect(): void {
    if (this.settings_ && this.connected_) {
      this.settings_.serialPort.close();
    }
    this.connected_ = false;
  }

  /**
   * Send an XCP packet and receive the response.
   * Aligns with xcptpmbrtu.c XcpTpMbRtuSendPacket.
   *
   * If txPacket is empty (len=0), only receives without sending (flush mode).
   */
  async sendPacket(
    txPacket: Uint8Array,
    timeout: number,
  ): Promise<{ data: Uint8Array; len: number }> {
    if (!this.settings_) throw new Error("Transport not initialized");
    const { serialPort, destinationAddr } = this.settings_;

    // Wait for T3.5 idle before transmission
    await this.waitT3_5();

    // Build and transmit the Modbus RTU frame
    // Aligns with C xcptpmbrtu.c:437-443: on write failure, skip reception entirely
    if (txPacket.length > 0) {
      const frame = xcpTpMbRtuBuildFrame(txPacket, destinationAddr);
      if (!(await serialPort.write(frame))) {
        // Aligns with C xcptpmbrtu.c: result=false, skip reception
        return { data: new Uint8Array(0), len: 0 };
      }
    }

    // Receive response (only reached when write succeeded or txPacket was empty)
    const deadline = Date.now() + timeout;
    const rxBuffer: number[] = [];

    // Phase 1: Read header (3 bytes: slaveAddr + fc + xcpLen)
    while (rxBuffer.length < 3 && Date.now() < deadline) {
      const chunk = await serialPort.read(1);
      if (chunk.length > 0) {
        rxBuffer.push(chunk[0]);
      }
    }

    if (rxBuffer.length < 3) {
      throw new Error("Timeout waiting for Modbus response header");
    }

    const xcpLen = rxBuffer[2];

    // Validate header
    if (
      rxBuffer[0] !== destinationAddr ||
      rxBuffer[1] !== XCP_TP_MBRTU_FCT_CODE_USER_XCP ||
      xcpLen === 0 ||
      xcpLen + 5 > XCPLOADER_PACKET_SIZE_MAX + 5
    ) {
      throw new Error("Invalid Modbus response header");
    }

    // Phase 2: Read remaining (xcpData + CRC)
    const totalExpected = 3 + xcpLen + 2;
    while (rxBuffer.length < totalExpected && Date.now() < deadline) {
      const chunk = await serialPort.read(1);
      if (chunk.length > 0) {
        rxBuffer.push(chunk[0]);
      }
    }

    if (rxBuffer.length < totalExpected) {
      throw new Error("Timeout waiting for complete Modbus response");
    }

    // Validate CRC
    const rxFrame = new Uint8Array(rxBuffer);
    const crcReceived = rxFrame[rxFrame.length - 2] | (rxFrame[rxFrame.length - 1] << 8);
    const crcComputed = xcpTpMbRtuCrcCalculate(rxFrame.subarray(0, rxFrame.length - 2));
    if (crcReceived !== crcComputed) {
      throw new Error(
        `CRC mismatch: received 0x${crcReceived.toString(16)}, computed 0x${crcComputed.toString(16)}`,
      );
    }

    // Extract XCP payload
    const xcpData = rxFrame.slice(3, 3 + xcpLen);
    return { data: xcpData, len: xcpLen };
  }

  /** Wait for T3.5 character time (idle line guarantee). */
  private async waitT3_5(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.t3_5Ms));
  }
}

// ── Helpers ──────────────────────────────────────────────────

/** Map numeric baudrate to SerialPortBaudrate enum. */
function mapBaudrate(baudrate: number): SerialPortBaudrate {
  switch (baudrate) {
    case 9600:
      return SerialPortBaudrate.BR9600;
    case 19200:
      return SerialPortBaudrate.BR19200;
    case 38400:
      return SerialPortBaudrate.BR38400;
    case 57600:
      return SerialPortBaudrate.BR57600;
    case 115200:
      return SerialPortBaudrate.BR115200;
    default:
      return SerialPortBaudrate.BR9600;
  }
}
