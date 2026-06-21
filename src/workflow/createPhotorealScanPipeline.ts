import { createExportTargetPlan } from "../core/exportTargets";
import { validateProjectForReconstruction } from "../core/frameValidation";
import { ForgeScanProjectManifest } from "../core/manifest";
import { createReconstructionPlan } from "../core/reconstructionPlan";
import { getNativeMaskingAvailability } from "../native/NativeMasking";
import { getNativeKsplatOptimizerAvailability } from "../native/NativeKsplatOptimizer";
import { runReconstructionJob } from "../reconstruction/ReconstructionJobRunner";
import { createPhotorealAsset } from "../reconstruction/splatting/photorealAsset";
import { runMaskingForProject } from "../masking/MaskingEngine";
import {
  createMaskingSummary,
  validateMaskCoverage
} from "../masking/MaskValidation";
import { MaskingStatus } from "../masking/MaskingTypes";
import { runKsplatGeneration } from "../splatting/NativeKsplatEngine";
import { KsplatOptimizerResult } from "../splatting/KsplatOptimizerResult";
import { KsplatOptimizerStatus } from "../splatting/KsplatTypes";
import { writeViewerHtml } from "../storage/projectPackageWriter";
import { writeProjectFile } from "../storage/projectStorage";
import { NormalExportItem, createNormalExportItems } from "./exportArtifacts";

export interface WorkflowAdvancedDetail {
  label: string;
  value: string;
}

export interface PreviewStatusItem {
  label: string;
  status:
    | "Generated"
    | "Fallback"
    | "Requires native processing"
    | "Not available"
    | "Failed";
  detail: string;
}

export interface CreatePhotorealScanPipelineResult {
  success: boolean;
  status: "generated" | "requires-native-build" | "failed";
  ksplatStatus: KsplatOptimizerStatus;
  maskingStatus: MaskingStatus;
  userMessage: string;
  progressSteps: string[];
  normalExports: NormalExportItem[];
  previewStatus: PreviewStatusItem[];
  internalArtifacts: string[];
  warnings: string[];
  errors: string[];
  advancedDetails: WorkflowAdvancedDetail[];
}

export async function createPhotorealScan(
  manifest: ForgeScanProjectManifest
): Promise<CreatePhotorealScanPipelineResult> {
  const progressSteps = [
    "Checking capture",
    "Preparing object",
    "Creating photoreal scan",
    "Preparing preview",
    "Finished"
  ];
  const validation = validateProjectForReconstruction(manifest);
  const nativeMaskingAvailability = await getNativeMaskingAvailability();
  const nativeOptimizerAvailability =
    await getNativeKsplatOptimizerAvailability();
  const initialAsset = createPhotorealAsset(manifest, "requires-native-build");
  const initialNormalExports = createNormalExportItems(manifest, initialAsset);
  const initialPreviewStatus = createPreviewStatus();
  const warnings: string[] = [];
  const advancedDetails: WorkflowAdvancedDetail[] = [];

  if (!validation.validForReconstruction) {
    return {
      success: false,
      userMessage: validation.errors.join(" "),
      progressSteps: progressSteps.slice(0, 1),
      normalExports: initialNormalExports,
      previewStatus: initialPreviewStatus,
      status: "failed",
      ksplatStatus: "failed",
      maskingStatus: "not-started",
      internalArtifacts: [],
      warnings: validation.warnings,
      errors: validation.errors,
      advancedDetails: validation.errors.map((error) => ({
        label: "Capture issue",
        value: error
      }))
    };
  }

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
  const masking = await runMaskingForProject(manifest);
  const maskCoverage = validateMaskCoverage(manifest, masking.artifacts);
  const maskingSummary = createMaskingSummary(manifest, masking.artifacts);
  const reconstruction = await runReconstructionJob(manifest);
  const optimizerResult = await runKsplatGeneration(
    manifest,
    masking.artifacts
  );
  const viewerUri = writeViewerHtml(manifest.project.id, manifest);
  const photorealAsset = createPhotorealAsset(
    manifest,
    getPhotorealAssetStatus(optimizerResult),
    optimizerResult.ksplatUri
  );
  const normalExports = createNormalExportItems(manifest, photorealAsset);
  const previewStatus = createPreviewStatus(optimizerResult);

  warnings.push(
    ...validation.warnings,
    ...masking.warnings,
    ...maskCoverage.warnings,
    ...optimizerResult.warnings
  );

  const errors = [
    ...validation.errors,
    ...masking.errors,
    ...maskCoverage.errors,
    ...optimizerResult.errors
  ];
  const internalArtifacts = [
    reconstructionPlanUri,
    exportTargetsUri,
    viewerUri,
    "advanced/splatting/ksplat-optimizer-input.json",
    "advanced/splatting/ksplat-result.json",
    ...masking.artifacts.flatMap((artifact) =>
      [artifact.rawMaskUri, artifact.refinedMaskUri].filter(
        (uri): uri is string => Boolean(uri)
      )
    ),
    ...reconstruction.artifacts.map((artifact) => artifact.uri)
  ];

  advancedDetails.push(
    {
      label: "Native masking availability",
      value: nativeMaskingAvailability.available
        ? "available"
        : (nativeMaskingAvailability.reason ??
          "Native AI masking requires a development/native build.")
    },
    {
      label: "Native .ksplat optimizer availability",
      value: nativeOptimizerAvailability.available
        ? "available"
        : (nativeOptimizerAvailability.reason ??
          "Native .ksplat optimizer requires a development/native build.")
    },
    { label: "Primary .ksplat target", value: photorealAsset.path },
    { label: "Optimizer input package", value: "advanced/splatting/ksplat-optimizer-input.json" },
    { label: "Optimizer status", value: optimizerResult.status },
    { label: "Preview fallback viewer", value: viewerUri },
    { label: "Object preparation", value: maskingSummary.userMessage },
    { label: "Masking engine result", value: `${masking.engineName} / ${masking.status}` },
    { label: "Mask coverage", value: `${maskCoverage.maskCount}/${maskCoverage.requiredFrames} required frames` },
    { label: "Internal alignment engine", value: reconstruction.job.implementation },
    { label: "Internal alignment warning", value: reconstruction.warnings.join(" ") },
    { label: "Internal alignment plan", value: reconstructionPlanUri },
    { label: "Export target plan", value: exportTargetsUri },
    ...masking.artifacts.flatMap((artifact) => [
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
    status: getResultStatus(optimizerResult),
    ksplatStatus: optimizerResult.status,
    maskingStatus: masking.status,
    userMessage: createUserMessage(optimizerResult),
    progressSteps,
    normalExports,
    previewStatus,
    internalArtifacts: [...new Set(internalArtifacts)],
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
    advancedDetails
  };
}

export type CreatePhotorealScanResult = CreatePhotorealScanPipelineResult;

function createPreviewStatus(
  optimizerResult?: KsplatOptimizerResult
): PreviewStatusItem[] {
  const ksplatGenerated =
    optimizerResult?.status === "generated" && optimizerResult.ksplatUri;
  const ksplatFailed = optimizerResult?.status === "failed";

  return [
    {
      label: "Photoreal Scan",
      status: ksplatGenerated ? "Generated" : ksplatFailed ? "Failed" : "Fallback",
      detail: ksplatGenerated
        ? `${optimizerResult.outputFilename} generated.`
        : ksplatFailed
          ? "Native processing failed. See Advanced Details."
          : "Native processing is required to generate the photoreal scan. Showing fallback preview only."
    },
    {
      label: "Preview Video",
      status: "Requires native processing",
      detail: "preview.mp4 requires native preview rendering."
    },
    {
      label: "Preview GIF",
      status: "Requires native processing",
      detail: "preview.gif requires native preview rendering."
    }
  ];
}

function getPhotorealAssetStatus(
  result: KsplatOptimizerResult
): "generated" | "requires-native-build" | "failed" {
  if (result.status === "generated" && result.ksplatUri) {
    return "generated";
  }

  if (result.status === "failed") {
    return "failed";
  }

  return "requires-native-build";
}

function getResultStatus(
  result: KsplatOptimizerResult
): "generated" | "requires-native-build" | "failed" {
  return getPhotorealAssetStatus(result);
}

function createUserMessage(result: KsplatOptimizerResult): string {
  if (result.status === "generated") {
    return ".ksplat generated.";
  }

  if (result.status === "failed") {
    return "Photoreal scan failed. See Advanced Details.";
  }

  return "Native processing is required to generate .ksplat.";
}
