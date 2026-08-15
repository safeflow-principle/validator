import type { SafeFlowDatabase } from "../storage/database";
import type { FinalizedHumanValidationReader } from "./types";

export class DatabaseFinalizedHumanValidationReader implements FinalizedHumanValidationReader {
  constructor(private readonly database: Pick<SafeFlowDatabase, "getHumanValidationFinalization" | "getLatestHumanValidationFinalization">) {}

  async getLatestForProject(projectId: string) {
    return (await this.database.getLatestHumanValidationFinalization(projectId)) ?? null;
  }

  async getById(finalizationId: string) {
    return (await this.database.getHumanValidationFinalization(finalizationId)) ?? null;
  }
}
