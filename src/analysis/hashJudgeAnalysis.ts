import type { JudgeArtifact } from "../core/types";
import { canonicalizeFinalizationPayload } from "../finalization/canonicalize";
import type { JudgeAnalysis, JudgeArtifactSnapshot } from "./types";

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeFinalizationPayload(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function judgeArtifactPayload(artifact: JudgeArtifact | JudgeArtifactSnapshot): JudgeArtifact {
  const { artifactHash: _artifactHash, ...payload } = artifact as JudgeArtifactSnapshot;
  return payload;
}

export async function snapshotJudgeArtifact(artifact: JudgeArtifact): Promise<JudgeArtifactSnapshot> {
  return { ...structuredClone(artifact), artifactHash: await sha256(artifact) };
}

export async function hashJudgeArtifactSet(artifacts: JudgeArtifactSnapshot[]): Promise<string> {
  return sha256([...artifacts]
    .sort((left, right) => left.itemId.localeCompare(right.itemId) || left.id.localeCompare(right.id))
    .map(({ id, itemId, judgeId, artifactHash }) => ({ id, itemId, judgeId, artifactHash })));
}

export function judgeAnalysisPayload(analysis: JudgeAnalysis): Omit<JudgeAnalysis, "analysisHash"> {
  const { analysisHash: _analysisHash, ...payload } = analysis;
  return payload;
}

export async function hashJudgeAnalysis(payload: Omit<JudgeAnalysis, "analysisHash">): Promise<string> {
  return sha256(payload);
}

export async function verifyJudgeAnalysis(analysis: JudgeAnalysis): Promise<boolean> {
  for (const artifact of analysis.judgeArtifacts) {
    if (await sha256(judgeArtifactPayload(artifact)) !== artifact.artifactHash) return false;
  }
  if (await hashJudgeArtifactSet(analysis.judgeArtifacts) !== analysis.judgeArtifactSetHash) return false;
  return await hashJudgeAnalysis(judgeAnalysisPayload(analysis)) === analysis.analysisHash;
}
