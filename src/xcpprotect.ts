/**
 * XCP Protection module — aligns with libopenblt xcpprotect.h / xcpprotect.c.
 *
 * Manages resource protection (seed/key) for XCP sessions.
 * The actual algorithm is injected via xcpProtectInit(), defaulting to
 * the OpenBLT demo algorithm from seednkey.ts.
 *
 * This mirrors the C architecture where xcpprotect.c loads a shared library
 * (.so/.dll) at runtime. In TypeScript, the algorithm is injected as an object.
 */

import { SeedNKeyAlgorithm } from "./seednkey.js";
import {
  XCPPROTECT_RESOURCE_PGM,
  XCPPROTECT_RESOURCE_STIM,
  XCPPROTECT_RESOURCE_DAQ,
  XCPPROTECT_RESOURCE_CALPAG,
  type XcpProtectAlgorithm,
} from "./xcpprotect-types.js";

// Re-export for backward compatibility
export {
  XCPPROTECT_RESOURCE_PGM,
  XCPPROTECT_RESOURCE_STIM,
  XCPPROTECT_RESOURCE_DAQ,
  XCPPROTECT_RESOURCE_CALPAG,
  type XcpProtectAlgorithm,
};

// ── Module State ─────────────────────────────────────────────

let algorithm_: XcpProtectAlgorithm | null = null;

// ── API Functions (aligning with C XcpProtect*) ─────────────

/**
 * Initialize the XCP protection module.
 * Aligns with C XcpProtectInit (which dlopen's a .so file).
 *
 * @param algorithm Seed/key algorithm to use. Defaults to SeedNKeyAlgorithm
 *                  (the OpenBLT demo algorithm from seednkey.c).
 */
export function xcpProtectInit(algorithm?: XcpProtectAlgorithm): void {
  algorithm_ = algorithm ?? SeedNKeyAlgorithm;
}

/**
 * Terminate the XCP protection module.
 * Aligns with C XcpProtectTerminate.
 */
export function xcpProtectTerminate(): void {
  algorithm_ = null;
}

/**
 * Get available resource privileges.
 * Aligns with C XcpProtectGetPrivileges → XCP_GetAvailablePrivileges.
 *
 * @returns Bitmask of available resources, or 0 if not initialized.
 */
export function xcpProtectGetPrivileges(): number {
  if (!algorithm_) return 0;
  return algorithm_.getAvailablePrivileges();
}

/**
 * Compute the key from a seed for resource unlocking.
 * Aligns with C XcpProtectComputeKeyFromSeed → XCP_ComputeKeyFromSeed.
 *
 * @param resource The resource to unlock.
 * @param seed The seed bytes from the device.
 * @returns The computed key bytes.
 * @throws If not initialized, seed is empty, or algorithm rejects the request.
 */
export function xcpProtectComputeKeyFromSeed(resource: number, seed: Uint8Array): Uint8Array {
  if (!algorithm_) {
    throw new Error("XCP protection module not initialized");
  }
  if (seed.length === 0) {
    throw new Error("Seed must not be empty");
  }
  return algorithm_.computeKeyFromSeed(resource, seed);
}
