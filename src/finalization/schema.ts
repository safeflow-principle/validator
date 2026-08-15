import { validateHumanValidationFinalization } from "../generated/schemaValidators.js";
import type { HumanValidationFinalization } from "./types";

export class HumanValidationFinalizationSchemaError extends Error {
  constructor(public readonly details: string[]) {
    super(`Invalid human-validation finalization: ${details.join("; ")}`);
    this.name = "HumanValidationFinalizationSchemaError";
  }
}

export function parseHumanValidationFinalization(value: unknown): HumanValidationFinalization {
  if (!validateHumanValidationFinalization(value)) {
    throw new HumanValidationFinalizationSchemaError(
      (validateHumanValidationFinalization.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`),
    );
  }
  return structuredClone(value) as HumanValidationFinalization;
}
