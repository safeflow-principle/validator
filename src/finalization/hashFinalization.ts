import { canonicalizeFinalizationPayload } from "./canonicalize";
import type { HumanValidationFinalization } from "./types";

export type HumanValidationFinalizationPayload = Omit<HumanValidationFinalization, "snapshotHash">;

export function finalizationHashPayload(finalization: HumanValidationFinalization): HumanValidationFinalizationPayload {
  const { snapshotHash: _snapshotHash, ...payload } = finalization;
  return payload;
}

export async function hashFinalizationPayload(payload: HumanValidationFinalizationPayload): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeFinalizationPayload(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyHumanValidationFinalizationHash(finalization: HumanValidationFinalization): Promise<boolean> {
  return (await hashFinalizationPayload(finalizationHashPayload(finalization))) === finalization.snapshotHash;
}
