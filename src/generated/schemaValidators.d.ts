import type { ErrorObject } from "ajv";

export interface StandaloneValidateFunction {
  (value: unknown): boolean;
  errors?: ErrorObject[] | null;
}

export const validateBenchmarkPack: StandaloneValidateFunction;
export const validateSafeFlowProjectBackup: StandaloneValidateFunction;
export const validateTrainingCurriculum: StandaloneValidateFunction;
export const validateHumanValidationFinalization: StandaloneValidateFunction;
export const validateJudgeAnalysis: StandaloneValidateFunction;
export const validateJudgeAnalysisReport: StandaloneValidateFunction;
