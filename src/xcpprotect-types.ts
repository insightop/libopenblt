/**
 * XCP Protection types and constants — aligns with libopenblt xcpprotect.h + seednkey.h.
 *
 * Separated from xcpprotect.ts to avoid circular dependencies between
 * xcpprotect.ts (loader) and seednkey.ts (algorithm implementation).
 * This mirrors the C architecture where xcpprotect.h and seednkey.h
 * each define the resource constants independently.
 */

// ── Resource Constants (matching C seednkey.h XCP_RESOURCE_*) ─

/** Programming resource. Aligns with XCP_RESOURCE_PGM. */
export const XCPPROTECT_RESOURCE_PGM = 0x10;

/** Data stimulation resource. Aligns with XCP_RESOURCE_STIM. */
export const XCPPROTECT_RESOURCE_STIM = 0x08;

/** Data acquisition resource. Aligns with XCP_RESOURCE_DAQ. */
export const XCPPROTECT_RESOURCE_DAQ = 0x04;

/** Calibration and paging resource. Aligns with XCP_RESOURCE_CALPAG. */
export const XCPPROTECT_RESOURCE_CALPAG = 0x01;

// ── Algorithm Interface (mirrors C function pointer table) ────

/**
 * Seed/Key algorithm interface — mirrors C seednkey.h function signatures.
 * Implement this to provide a custom seed/key algorithm.
 */
export interface XcpProtectAlgorithm {
  /** Compute key from seed. Aligns with C XCP_ComputeKeyFromSeed. */
  computeKeyFromSeed(resource: number, seed: Uint8Array): Uint8Array;
  /** Get available resource privileges. Aligns with C XCP_GetAvailablePrivileges. */
  getAvailablePrivileges(): number;
}
