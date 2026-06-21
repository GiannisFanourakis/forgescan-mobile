import { createExportTargetPlan } from "../core/exportTargets";
import { validateProjectForReconstruction } from "../core/frameValidation";
import { ForgeScanProjectManifest } from "../core/manifest";
import { createReconstructionPlan } from "../core/reconstructionPlan";
import { createSegmentationPlan } from "../core/segmentationPlan";
import { runReconstructionJob } from "../reconstruction/ReconstructionJobRunner";
import { exportSplattingJob } from "../reconstruction/splatting/splattingPackage";
import { runSegmentationForProject } from "../segmentation/LocalSegmentationEngine";
import { writeProjectFile } from "../storage/projectStorage";
import { writeViewerHtml } from "../storage/projectPackageWriter";

export interface WorkflowGeneratedOutput {
  label: string;
  path: string;
  uri?: string;
  group:
    | "interactiveViewer"
    | "threeDFiles"
    | "photorealPackage"
    | "projectFiles";
}

export interface WorkflowAdvancedDetail {
  label: string;
  value: string;
}

export interface Create3DResultPipelineResult {
  success: boolean;
  userMessage: string;
  progressSteps: string[];
  generatedOutputs: WorkflowGeneratedOutput[];
  warnings: string[];
  advancedDetails: WorkflowAdvancedDetail[];
}

export async function create3DResult(
  manifest: ForgeScanProjectManifest
): Promise<Create3DResultPipelineResult> {
  const progressSteps = [
    "Checking capture",
    "Preparing object",
    "Creating 3D preview",
    "Preparing photoreal package",
    "Creating viewer",
    "Finished"
  ];
  const validation = validateProjectForReconstruction(manifest);
  const generatedOutputs: WorkflowGeneratedOutput[] = [];
  const warnings: string[] = [];
  const advancedDetails: WorkflowAdvancedDetail[] = [];

  if (!validation.validForReconstruction) {
    return {
      success: false,
      userMessage: validation.errors.join(" "),
      progressSteps: progressSteps.slice(0, 1),
      generatedOutputs,
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

  generatedOutputs.push(
    {
      label: "Interactive Viewer",
      path: "exports/viewer.html",
      uri: viewerUri,
      group: "interactiveViewer"
    },
    ...reconstruction.artifacts
      .filter((artifact) => artifact.role === "model" || artifact.role === "point-cloud")
      .map((artifact) => ({
        label:
          artifact.format === "ply" ? "Point Cloud" : "Rough 3D Preview",
        path: artifact.path,
        uri: artifact.uri,
        group: "threeDFiles" as const
      })),
    {
      label: "Photoreal Package",
      path: "exports/splatting-job.json",
      group: "photorealPackage"
    },
    {
      label: "Project Files",
      path: "exports/reconstruction-job.json",
      group: "projectFiles"
    }
  );

  warnings.push(
    ...validation.warnings,
    ...segmentation.notes,
    ...reconstruction.warnings,
    "Basic processing used. Higher-quality AI/photogrammetry can replace this later."
  );

  advancedDetails.push(
    { label: "Object separation engine", value: segmentation.engine },
    { label: "Object separation result", value: `${segmentation.successfulFrames}/${segmentation.totalFrames} frames` },
    { label: "Rough 3D engine", value: reconstruction.job.implementation },
    { label: "Photoreal package frames", value: String(splattingPackage.frames.length) },
    { label: "Segmentation plan", value: segmentationPlanUri },
    { label: "Reconstruction plan", value: reconstructionPlanUri },
    { label: "Export target plan", value: exportTargetsUri },
    { label: "Photoreal package", value: "exports/splatting-job.json" },
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
    userMessage: "3D result created. Preview is ready.",
    progressSteps,
    generatedOutputs,
    warnings: [...new Set(warnings)],
    advancedDetails
  };
}
