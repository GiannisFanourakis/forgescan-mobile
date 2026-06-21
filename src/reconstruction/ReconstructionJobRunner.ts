import { ForgeScanProjectManifest } from "../core/manifest";
import { runLocalReconstruction } from "./LocalReconstructionEngine";
import { ReconstructionRunResult } from "./ReconstructionTypes";

export function runReconstructionJob(
  manifest: ForgeScanProjectManifest
): Promise<ReconstructionRunResult> {
  return runLocalReconstruction(manifest);
}
