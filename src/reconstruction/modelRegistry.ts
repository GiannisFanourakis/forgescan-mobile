import {
  DEFAULT_RECONSTRUCTION_MODEL_ID,
  DEFAULT_RECONSTRUCTION_MODEL_VERSION,
  ExportFormat,
  ForgeScanProjectManifest,
  ReconstructionEngine,
  ReconstructionModelId,
  ReconstructionModelRuntime,
  ReconstructionModelSelection,
  ReconstructionModelStatus
} from "../core/manifest";

export type ReconstructionModelInputType = "frames" | "video";

export interface ReconstructionModelDefinition {
  id: ReconstructionModelId;
  label: string;
  version: string;
  engine: ReconstructionEngine;
  runtime: ReconstructionModelRuntime;
  status: ReconstructionModelStatus;
  summary: string;
  inputTypes: ReconstructionModelInputType[];
  targetFormats: ExportFormat[];
  minFrames: number;
  recommendedFrames: number;
  nativeModules: string[];
}

export const defaultReconstructionModel: ReconstructionModelDefinition = {
  id: DEFAULT_RECONSTRUCTION_MODEL_ID,
  label: "ForgeScan AI Mobile v1",
  version: DEFAULT_RECONSTRUCTION_MODEL_VERSION,
  engine: "photogrammetry",
  runtime: "on-device",
  status: "requires-native-build",
  summary:
    "On-device AI pipeline for masks, pose estimation, multi-rotation alignment, mesh reconstruction, and texture cleanup.",
  inputTypes: ["frames", "video"],
  targetFormats: ["glb", "usdz", "obj", "stl", "html", "mp4", "gif"],
  minFrames: 72,
  recommendedFrames: 120,
  nativeModules: [
    "MediaPipe or LiteRT segmentation",
    "OpenCV feature matching",
    "ARCore or ARKit pose assistance",
    "GPU accelerated mesh reconstruction"
  ]
};

export const reconstructionModels: ReconstructionModelDefinition[] = [
  defaultReconstructionModel,
  {
    id: "forgescan-ai-splat-preview-v1",
    label: "ForgeScan AI Splat Preview v1",
    version: "0.1-plan",
    engine: "gaussian-splatting",
    runtime: "on-device",
    status: "planned",
    summary:
      "Fast neural preview track for dense visual inspection before final mesh export.",
    inputTypes: ["frames", "video"],
    targetFormats: ["glb", "usdz", "obj", "stl", "html", "mp4", "gif"],
    minFrames: 96,
    recommendedFrames: 180,
    nativeModules: [
      "Feature tracking",
      "Neural point or splat optimization",
      "Preview renderer",
      "Mesh conversion pass"
    ]
  },
  {
    id: "external-ai-reconstruction",
    label: "External AI Reconstruction Package",
    version: "0.1-plan",
    engine: "external",
    runtime: "external",
    status: "external-ready",
    summary:
      "Exports a structured capture package for a desktop, cloud, or lab reconstruction system.",
    inputTypes: ["frames", "video"],
    targetFormats: ["glb", "usdz", "obj", "stl", "html", "mp4", "gif"],
    minFrames: 72,
    recommendedFrames: 120,
    nativeModules: []
  }
];

export function getReconstructionModel(
  modelId?: ReconstructionModelId
): ReconstructionModelDefinition {
  return (
    reconstructionModels.find((model) => model.id === modelId) ??
    defaultReconstructionModel
  );
}

export function getSelectedReconstructionModel(
  manifest: ForgeScanProjectManifest
): ReconstructionModelDefinition {
  return getReconstructionModel(manifest.processing.reconstruction.model?.id);
}

export function createReconstructionModelSelection(
  model: ReconstructionModelDefinition
): ReconstructionModelSelection {
  return {
    id: model.id,
    version: model.version,
    runtime: model.runtime,
    status: model.status
  };
}

export function formatModelStatus(status: ReconstructionModelStatus): string {
  return status.replace(/-/g, " ");
}

export function formatModelRuntime(runtime: ReconstructionModelRuntime): string {
  return runtime.replace(/-/g, " ");
}
