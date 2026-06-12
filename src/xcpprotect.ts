/**
 * XCP Protection module — aligns with libopenblt xcpprotect.h / xcpprotect.c.
 *
 * Implements resource protection (seed/key) for XCP sessions.
 * Uses the default OpenBLT SeedNKey algorithm from SeedNKey/seednkey.c:
 *   - Key computation for PGM: key[i] = seed[i] - 1 (each byte decremented by 1)
 *   - Available privileges: PGM resource only
 *
 * This matches the XcpVerifyKeyHook() in the OpenBLT demo bootloaders.
 * You are free to change the algorithm to protect your target from unwanted updates.
 */

// ── Resource Constants (matching C seednkey.h XCP_RESOURCE_*) ─

/** Programming resource. Aligns with XCP_RESOURCE_PGM. */
export const XCPPROTECT_RESOURCE_PGM = 0x10

/** Data stimulation resource. Aligns with XCP_RESOURCE_STIM. */
export const XCPPROTECT_RESOURCE_STIM = 0x08

/** Data acquisition resource. Aligns with XCP_RESOURCE_DAQ. */
export const XCPPROTECT_RESOURCE_DAQ = 0x04

/** Calibration and paging resource. Aligns with XCP_RESOURCE_CALPAG. */
export const XCPPROTECT_RESOURCE_CALPAG = 0x01

// ── Module State ─────────────────────────────────────────────

let initialized = false

// ── API Functions (aligning with C XcpProtect* + SeedNKey XCP_*) ─

/**
 * Initialize the XCP protection module.
 * Aligns with C XcpProtectInit.
 */
export function xcpProtectInit(_seedKeyFile: string | null): void {
  initialized = true
}

/**
 * Terminate the XCP protection module.
 * Aligns with C XcpProtectTerminate.
 */
export function xcpProtectTerminate(): void {
  initialized = false
}

/**
 * Get available resource privileges.
 * Aligns with C XcpProtectGetPrivileges → XCP_GetAvailablePrivileges.
 *
 * Returns a bitmask of resources for which a key algorithm is available.
 * Default OpenBLT algorithm: only PGM resource is supported.
 *
 * @returns Bitmask of available resources, or 0 if not initialized.
 */
export function xcpProtectGetPrivileges(): number {
  if (!initialized) return 0

  // Aligns with seednkey.c XCP_GetAvailablePrivileges:
  // "supports a key computation algorithm for the PGM resource"
  return XCPPROTECT_RESOURCE_PGM
}

/**
 * Compute the key from a seed for resource unlocking.
 * Aligns with C XcpProtectComputeKeyFromSeed → XCP_ComputeKeyFromSeed.
 *
 * Default OpenBLT algorithm (seednkey.c):
 *   For PGM resource: key[i] = seed[i] - 1 for each byte.
 *   This matches the XcpVerifyKeyHook() in OpenBLT demo bootloaders.
 *
 * @param resource The resource to unlock (XCPLOADER_RESOURCE_*).
 * @param seed The seed bytes from the device.
 * @returns The computed key bytes.
 * @throws If not initialized, invalid resource, or unsupported resource.
 */
export function xcpProtectComputeKeyFromSeed(
  resource: number,
  seed: Uint8Array,
): Uint8Array {
  if (!initialized) {
    throw new Error('XCP protection module not initialized')
  }

  if (seed.length === 0) {
    throw new Error('Seed must not be empty')
  }

  // Aligns with seednkey.c XCP_ComputeKeyFromSeed:
  // Only PGM resource is supported in the default algorithm
  if (resource === XCPPROTECT_RESOURCE_PGM) {
    // Compute the key: decrement each seed byte by 1
    // Aligns with seednkey.c line 72: keyPtr[idx] = seedPtr[idx] - 1
    const key = new Uint8Array(seed.length)
    for (let idx = 0; idx < seed.length; idx++) {
      key[idx] = (seed[idx] - 1) & 0xFF
    }
    return key
  }

  // Unsupported resource
  throw new Error(
    `No key algorithm available for resource 0x${resource.toString(16)}. ` +
    `Only PGM (0x${XCPPROTECT_RESOURCE_PGM.toString(16)}) is supported.`,
  )
}
