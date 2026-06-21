import { ExportFormat, ForgeScanProjectManifest } from "../core/manifest";

export type ReconstructionRunStatus = "complete" | "warning" | "failed";

export interface ReconstructionArtifact {
  path: string;
  uri: string;
  format: ExportFormat | "json" | "ply";
  role: "input" | "job" | "model" | "point-cloud" | "viewer";
}

export interface ReconstructionJob {
  projectId: string;
  projectTitle: string;
  createdAt: string;
  implementation: "local-rough-proxy";
  status: ReconstructionRunStatus;
  manifest: Pick<ForgeScanProjectManifest, "project" | "capture">;
  stages: string[];
  artifacts: ReconstructionArtifact[];
  warnings: string[];
}

export interface ReconstructionRunResult {
  status: ReconstructionRunStatus;
  job: ReconstructionJob;
  artifacts: ReconstructionArtifact[];
  warnings: string[];
}
