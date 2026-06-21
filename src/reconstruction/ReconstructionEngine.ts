import { ForgeScanProjectManifest } from "../core/manifest";
import { ReconstructionRunResult } from "./ReconstructionTypes";

export interface ReconstructionEngine {
  runReconstruction(
    manifest: ForgeScanProjectManifest
  ): Promise<ReconstructionRunResult>;
}
