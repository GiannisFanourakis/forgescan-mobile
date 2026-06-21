import { ForgeScanProjectManifest } from "../core/manifest";
import {
  createPhotorealAsset,
  getPhotorealStatusLabel
} from "../reconstruction/splatting/photorealAsset";
import { writeFullProjectPackage } from "../storage/projectPackageWriter";
import { NormalExportItem, createNormalExportItems } from "./exportArtifacts";
import { WorkflowAdvancedDetail } from "./createPhotorealScanPipeline";

export interface ExportPhotorealScanResult {
  success: boolean;
  userMessage: string;
  normalExports: NormalExportItem[];
  warnings: string[];
  advancedDetails: WorkflowAdvancedDetail[];
}

export async function exportPhotorealScan(
  manifest: ForgeScanProjectManifest
): Promise<ExportPhotorealScanResult> {
  const packageResult = await writeFullProjectPackage(
    manifest.project.id,
    manifest
  );
  const photorealAsset = createPhotorealAsset(
    manifest,
    "requires-external-optimizer"
  );
  const normalExports = createNormalExportItems(manifest, photorealAsset);

  return {
    success: true,
    userMessage: `Export .ksplat target ready: ${photorealAsset.filename} (${getPhotorealStatusLabel(photorealAsset.status)}).`,
    normalExports,
    warnings: packageResult.warnings,
    advancedDetails: [
      { label: "Project folder", value: packageResult.projectRootUri },
      ...packageResult.generatedFiles.map((file) => ({
        label: "Internal artifact",
        value: file
      }))
    ]
  };
}
