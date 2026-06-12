/**
 * Serial port abstraction — aligns with libopenblt serialport.h.
 *
 * Defines the interface that transport layers (xcptpmbrtu) consume.
 * Actual implementations are provided by the host application
 * (e.g., Web Serial API, Node serialport, or HTTP bridge).
 */

// ── Enumerations (matching C serialport.h) ───────────────────

/** Supported baud rates. */
export enum SerialPortBaudrate {
  BR9600 = 0,
  BR19200 = 1,
  BR38400 = 2,
  BR57600 = 3,
  BR115200 = 4,
}

/** Supported parity modes. */
export enum SerialPortParity {
  NONE = 0,
  ODD = 1,
  EVEN = 2,
}

/** Supported stop bit configurations. */
export enum SerialPortStopbits {
  ONE = 0,
  TWO = 1,
}

/** Numeric baud rate to enum mapping. */
export function baudrateEnumFromNumber(baudrate: number): SerialPortBaudrate {
  switch (baudrate) {
    case 9600: return SerialPortBaudrate.BR9600
    case 19200: return SerialPortBaudrate.BR19200
    case 38400: return SerialPortBaudrate.BR38400
    case 57600: return SerialPortBaudrate.BR57600
    case 115200: return SerialPortBaudrate.BR115200
    default: return SerialPortBaudrate.BR9600
  }
}

// ── Serial Port Interface ────────────────────────────────────

/**
 * Serial port driver interface.
 * Aligns with C serialport.h function prototypes.
 *
 * Implementations must provide byte-level read/write with timeout semantics.
 * The transport layer (xcptpmbrtu) handles Modbus RTU framing and CRC on top of this.
 */
export interface SerialPort {
  /** Open the serial port with the specified parameters. */
  open(
    portName: string,
    baudrate: SerialPortBaudrate,
    parity: SerialPortParity,
    stopbits: SerialPortStopbits,
  ): Promise<boolean>

  /** Close the serial port. */
  close(): void

  /** Write bytes to the serial port. Returns true on success. */
  write(data: Uint8Array): Promise<boolean>

  /**
   * Read up to `length` bytes from the serial port.
   * Returns the bytes actually read (may be fewer than `length`).
   */
  read(length: number): Promise<Uint8Array>
}
