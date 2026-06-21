import { createExportTargetPlan } from "../core/exportTargets";
import { validateProjectForReconstruction } from "../core/frameValidation";
import { ForgeScanProjectManifest } from "../core/manifest";
import { createReconstructionPlan } from "../core/reconstructionPlan";
import { createSegmentationPlan } from "../core/segmentationPlan";
import { runReconstructionJob } from "../reconstruction/ReconstructionJobRunner";
import { createPhotorealAsset } from "../reconstruction/splatting/photorealAsset";
import { exportSplattingJob } from "../reconstruction/splatting/splattingPackage";
import { runSegmentationForProject } from "../segmentation/LocalSegmentationEngine";
import { writeViewerHtml } from "../storage/projectPackageWriter";
import { writeProjectFile } from "../storage/projectStorage";
import { NormalExportItem, createNormalExportItems } from "./exportArtifacts";

export interface WorkflowAdvancedDetail {
  label: string;
  value: string;
}

export interface PreviewStatusItem {
  label: string;
  status: "Ready" | "Fallback" | "Unavailable";
  detail: string;
}

export interface CreatePhotorealScanPipelineResult {
  success: boolean;
  userMessage: string;
  progressSteps: string[];
  normalExports: NormalExportItem[];
  previewStatus: PreviewStatusItem[];
  warnings: string[];
  advancedDetails: WorkflowAdvancedDetail[];
}

export async function createPhotorealScan(
  manifest: ForgeScanProjectManifest
): Promise<CreatePhotorealScanPipelineResult> {
  const progressSteps = [
    "Checking capture",
    "Preparing object",
    "Preparing alignment",
    "Creating splat data",
    "Preparing preview fallback",
    "Finished"
  ];
  const validation = validateProjectForReconstruction(manifest);
  const photorealAsset = createPhotorealAsset(
    manifest,
    "requires-external-optimizer"
  );
  const normalExports = createNormalExportItems(manifest, photorealAsset);
  const previewStatus = createPreviewStatus();
  const warnings: string[] = [];
  const advancedDetails: WorkflowAdvancedDetail[] = [];

  if (!validation.validForReconstruction) {
    return {
      success: false,
      userMessage: validation.errors.join(" "),
      progressSteps: progressSteps.slice(0, 1),
      normalExports,
      previewStatus,
      warnings: validation.warnings,
      advancedDetails: validation.errors.map((error) => ({
        label: "Capture issue",
        value: error
      }))
    };
  }

  const segmentationPlanUri = writeProjectFile(
    manifest,
    "exports/segmentation-plan.json",
    JSON.stringify(createSegmentationPlan(manifest), null, 2)
  );
  const reconstructionPlanUri = writeProjectFile(
    manifest,
    "exports/reconstruction-plan.json",
    JSON.stringify(createReconstructionPlan(manifest), null, 2)
  );
  const exportTargetsUri = writeProjectFile(
    manifest,
    "exports/export-targets.json",
    JSON.stringify(createExportTargetPlan(manifest), null, 2)
  );
  const segmentation = await runSegmentationForProject(manifest);
  const reconstruction = await runReconstructionJob(manifest);
  const splattingPackage = exportSplattingJob(manifest);
  const viewerUri = writeViewerHtml(manifest.project.id, manifest);

  warnings.push(
    ...validation.warnings,
    ...segmentation.notes,
    ...reconstruction.warnings,
    "Requires native/external splat optimizer",
    "Preview fallback is available; no fake .ksplat was created."
  );

  advancedDetails.push(
    { label: "Primary .ksplat target", value: splattingPackage.primaryOutput },
    { label: "Splatting package", value: "photoreal/splatting-job.json" },
    { label: "Camera data", value: splattingPackage.cameraDataPath },
    { label: "Preview fallback viewer", value: viewerUri },
    { label: "Object preparation engine", value: segmentation.engine },
    { label: "Object preparation result", value: `${segmentation.successfulFrames}/${segmentation.totalFrames} frames` },
    { label: "Alignment/reconstruction engine", value: reconstruction.job.implementation },
    { label: "Segmentation plan", value: segmentationPlanUri },
    { label: "Reconstruction plan", value: reconstructionPlanUri },
    { label: "Export target plan", value: exportTargetsUri },
    ...segmentation.artifacts.flatMap((artifact) => [
      { label: "Raw mask", value: artifact.rawMaskUri ?? artifact.rawMaskPath },
      {
        label: "Refined mask",
        value: artifact.refinedMaskUri ?? artifact.refinedMaskPath
      }
    ]),
    ...reconstruction.artifacts.map((artifact) => ({
      label: artifact.role,
      value: artifact.uri
    }))
  );

  return {
    success: true,
    userMessage:
      "Photoreal scan inputs are ready. .ksplat requires native/external splat optimization.",
    progressSteps,
    normalExports,
    previewStatus,
    warnings: [...new Set(warnings)],
    advancedDetails
  };
}

function createPreviewStatus(): PreviewStatusItem[] {
  return [
    {
      label: "Photoreal Scan",
      status: "Fallback",
      detail:
        ".ksplat preview requires native/external splat optimization. Showing capture preview fallback."
    },
    {
      label: "Preview Video",
      status: "Unavailable",
      detail: "preview.mp4 is not generated in this Expo build."
    },
    {
      label: "Preview GIF",
      status: "Unavailable",
      detail: "preview.gif is not generated in this Expo build."
    }
  ];
}
