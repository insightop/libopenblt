/**
 * Communication session module — aligns with libopenblt session.c / session.h.
 *
 * Bridges the SessionProtocol interface (implemented by XcpLoader)
 * with module-level functions that mirror C's Session* API.
 *
 * Usage:
 *   sessionInit(xcpLoader, settings)
 *   await sessionStart()
 *   await sessionClearMemory(addr, len)
 *   await sessionWriteData(addr, len, data)
 *   await sessionStop()
 *   sessionTerminate()
 */

import type { SessionProtocol } from './xcploader.js'

// ── Module State ─────────────────────────────────────────────

let protocolPtr: SessionProtocol | null = null

// ── API Functions (aligning with C Session* functions) ───────

/**
 * Initialize the session with a protocol module.
 * Aligns with C SessionInit.
 */
export function sessionInit(protocol: SessionProtocol, settings: unknown): void {
  protocolPtr = protocol
  if (protocolPtr) {
    protocolPtr.init(settings)
  }
}

/**
 * Terminate the session.
 * Aligns with C SessionTerminate.
 */
export function sessionTerminate(): void {
  if (protocolPtr) {
    protocolPtr.terminate()
  }
  protocolPtr = null
}

/**
 * Start the firmware update session.
 * Aligns with C SessionStart.
 */
export async function sessionStart(): Promise<boolean> {
  if (!protocolPtr) return false
  return protocolPtr.start()
}

/**
 * Stop the firmware update session.
 * Aligns with C SessionStop.
 */
export async function sessionStop(): Promise<void> {
  if (protocolPtr) {
    await protocolPtr.stop()
  }
}

/**
 * Clear (erase) a memory range on the target.
 * Aligns with C SessionClearMemory.
 */
export async function sessionClearMemory(address: number, len: number): Promise<boolean> {
  if (!protocolPtr || len === 0) return false
  return protocolPtr.clearMemory(address, len)
}

/**
 * Write data to the target.
 * Aligns with C SessionWriteData.
 */
export async function sessionWriteData(
  address: number,
  len: number,
  data: Uint8Array,
): Promise<boolean> {
  if (!protocolPtr || len === 0 || !data) return false
  return protocolPtr.writeData(address, len, data)
}

/**
 * Read data from the target.
 * Aligns with C SessionReadData.
 */
export async function sessionReadData(
  address: number,
  len: number,
): Promise<Uint8Array> {
  if (!protocolPtr) throw new Error('Session not initialized')
  if (len === 0) throw new Error('SessionReadData: len must be > 0')
  return protocolPtr.readData(address, len)
}

/**
 * Check info table on the target.
 * Aligns with C SessionCheckInfoTable.
 */
export async function sessionCheckInfoTable(): Promise<{
  supported: boolean
  okay: boolean
}> {
  if (!protocolPtr) throw new Error('Session protocol not initialized')
  return protocolPtr.checkInfoTable()
}
