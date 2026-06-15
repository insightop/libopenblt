/**
 * XCP Seed and Key algorithm — aligns with libopenblt SeedNKey/seednkey.c.
 *
 * Default OpenBLT demo algorithm:
 *   - Key computation for PGM: key[i] = seed[i] - 1
 *   - Available privileges: PGM resource only
 *
 * This matches the XcpVerifyKeyHook() in the OpenBLT demo bootloaders.
 * You are free to change the algorithm to protect your target from unwanted updates.
 */

import type { XcpProtectAlgorithm } from "./xcpprotect-types.js";
import { XCPPROTECT_RESOURCE_PGM } from "./xcpprotect-types.js";

/**
 * Compute the key for the requested resource.
 * Aligns with C seednkey.c XCP_ComputeKeyFromSeed.
 *
 * @param resource Resource for which the unlock key is requested.
 * @param seed Seed bytes from the device.
 * @returns Computed key bytes.
 * @throws If resource is not PGM or seed is empty.
 */
export function seednkeyComputeKeyFromSeed(resource: number, seed: Uint8Array): Uint8Array {
  if (seed.length === 0) {
    throw new Error("Seed must not be empty");
  }

  if (resource !== XCPPROTECT_RESOURCE_PGM) {
    throw new Error(
      `No key algorithm available for resource 0x${resource.toString(16)}. ` +
        `Only PGM (0x${XCPPROTECT_RESOURCE_PGM.toString(16)}) is supported.`,
    );
  }

  const key = new Uint8Array(seed.length);
  for (let idx = 0; idx < seed.length; idx++) {
    key[idx] = (seed[idx] - 1) & 0xff;
  }
  return key;
}

/**
 * Get a bitmask of the resources for which a key algorithm is available.
 * Aligns with C seednkey.c XCP_GetAvailablePrivileges.
 *
 * @returns Bitmask of available resources (PGM only in default algorithm).
 */
export function seednkeyGetAvailablePrivileges(): number {
  return XCPPROTECT_RESOURCE_PGM;
}

/**
 * Default SeedNKey algorithm object — implements XcpProtectAlgorithm.
 * Pass to xcpProtectInit() to use the OpenBLT demo algorithm.
 */
export const SeedNKeyAlgorithm: XcpProtectAlgorithm = {
  computeKeyFromSeed: seednkeyComputeKeyFromSeed,
  getAvailablePrivileges: seednkeyGetAvailablePrivileges,
};
