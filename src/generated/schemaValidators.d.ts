import type { ErrorObject } from "ajv";

export interface StandaloneValidateFunction {
  (value: unknown): boolean;
  errors?: ErrorObject[] | null;
}

export const validateBenchmarkPack: StandaloneValidateFunction;
export const validateSafeFlowProjectBackup: StandaloneValidateFunction;
