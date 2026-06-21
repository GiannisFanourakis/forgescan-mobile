import { RotationId } from "../core/manifest";

export type NativeMaskingAvailabilityMode = "native-ai" | "fallback-local" | "unavailable";
export type NativeMaskingModelHint = "birefnet-object-background";
export type NativeMaskingDesiredFormat = "png";
export type NativeMaskingModelStatus = "loaded" | "missing" | "load-failed" | "inference-failed";
export type NativeMaskingEngineStatus =
  | "birefnet-model-missing"
  | "birefnet-load-failed"
  | "birefnet-running"
  | "birefnet-complete"
  | "temporary-deeplab-fallback"
  | "fallback-local"
  | "failed";

export interface NativeMaskingAvailability {
  available: boolean;
  mode: NativeMaskingAvailabilityMode;
  moduleName: "ForgeScanNativeMasking";
  reason?: string;
  engineName?: string;
  engineVersion?: string;
  modelExists?: boolean;
  birefnetModelPresent?: boolean;
  temporaryDeepLabModelPresent?: boolean;
  modelLoaded?: boolean;
  inferenceRan?: boolean;
  maskPngWritten?: boolean;
  modelName?: string;
  modelAssetPath?: string;
  modelStatus?: NativeMaskingModelStatus;
  birefnetLoaded?: boolean;
  birefnetInferencePassed?: boolean;
  inferenceBackend?: string;
  fallbackUsed?: boolean;
  activeMaskingEngine?: string;
  maskingEngineStatus?: NativeMaskingEngineStatus;
  warnings?: string[];
  errors?: string[];
}

export interface NativeMaskingFrameInput {
  rotationId: RotationId;
  frameIndex: number;
  frameUri: string;
}

export interface NativeMaskingRotationMetadata {
  rotationId: RotationId;
  label: string;
  required: boolean;
  frameCount: number;
  status: string;
}

export interface NativeMaskingInput {
  projectId: string;
  frames: NativeMaskingFrameInput[];
  rotationMetadata: NativeMaskingRotationMetadata[];
  outputDirectory: string;
  modelHint: NativeMaskingModelHint;
  desiredMaskFormat: NativeMaskingDesiredFormat;
  refinementEnabled: boolean;
}

export interface NativeMaskingProgress {
  status: "processing";
  completedFrames: number;
  totalFrames: number;
  message?: string;
}

export interface NativeMaskArtifactOutput {
  rotationId: RotationId;
  frameIndex: number;
  sourceFrameUri: string;
  rawMaskUri?: string;
  refinedMaskUri?: string;
  rawMaskPath: string;
  refinedMaskPath: string;
  engineName?: string;
  modelName?: string;
  modelLoaded?: boolean;
  inferenceRan?: boolean;
  maskPngWritten?: boolean;
  status: "complete" | "failed";
  warnings: string[];
  errors: string[];
}

export interface NativeMaskingOutput {
  status: "complete" | "requires-native-build" | "failed";
  maskArtifacts: NativeMaskArtifactOutput[];
  engineName: string;
  engineVersion?: string;
  modelName: string;
  modelExists?: boolean;
  birefnetModelPresent?: boolean;
  temporaryDeepLabModelPresent?: boolean;
  modelLoaded?: boolean;
  inferenceRan?: boolean;
  maskPngWritten?: boolean;
  modelStatus?: NativeMaskingModelStatus;
  birefnetLoaded?: boolean;
  birefnetInferencePassed?: boolean;
  inferenceBackend?: string;
  fallbackUsed?: boolean;
  activeMaskingEngine?: string;
  maskingEngineStatus?: NativeMaskingEngineStatus;
  warnings: string[];
  errors: string[];
}

export interface NativeMaskingSmokeTestResult {
  status: "pass" | "fail" | "requires-native-build";
  maskUri?: string;
  maskBytes?: number;
  modelExists?: boolean;
  birefnetModelPresent?: boolean;
  temporaryDeepLabModelPresent?: boolean;
  modelLoaded?: boolean;
  inferenceRan?: boolean;
  maskPngWritten?: boolean;
  modelStatus?: NativeMaskingModelStatus;
  modelName?: string;
  engineName?: string;
  modelAssetPath?: string;
  birefnetLoaded?: boolean;
  birefnetInferencePassed?: boolean;
  inferenceBackend?: string;
  fallbackUsed?: boolean;
  activeMaskingEngine?: string;
  maskingEngineStatus?: NativeMaskingEngineStatus;
  warnings: string[];
  errors: string[];
}
