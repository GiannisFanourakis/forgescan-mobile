import { RotationId } from "../core/manifest";

export type NativeMaskingAvailabilityMode = "native-ai" | "fallback-local" | "unavailable";
export type NativeMaskingModelHint = "mlkit-subject-segmentation";
export type NativeMaskingDesiredFormat = "png";
export type NativeMaskingModelPreference =
  | "auto-mobile"
  | "mlkit-subject-segmentation"
  | "fallback-local";
export type NativeMaskingModelStatus =
  | "loaded"
  | "not-loaded"
  | "missing"
  | "load-failed"
  | "inference-failed"
  | "oom"
  | "oom-guard"
  | "full-model-disabled";
export type NativeMaskingEngineStatus =
  | "mlkit-running"
  | "mlkit-complete"
  | "available-not-loaded"
  | "fallback-local"
  | "failed";

export interface NativeMaskingMemorySnapshot {
  maxMemoryBytes?: number;
  totalMemoryBytes?: number;
  freeMemoryBytes?: number;
  availableMemoryBytes?: number;
}

export interface NativeMaskingDetectedModel {
  path: string;
  tier: string;
  runtime: string;
  present: boolean;
  fileSize: number;
  quantized: boolean;
  fullModel: boolean;
  defaultEligible: boolean;
}

export interface NativeMaskingAvailability {
  available: boolean;
  mode: NativeMaskingAvailabilityMode;
  moduleName: "ForgeScanNativeMasking";
  reason?: string;
  engineName?: string;
  engineVersion?: string;
  mlKitAvailable?: boolean;
  defaultMaskingEngine?: string;
  confidenceThreshold?: number;
  modelExists?: boolean;
  modelPresent?: boolean;
  modelPath?: string;
  modelTier?: string;
  modelPreference?: NativeMaskingModelPreference;
  modelFileSize?: number;
  runtime?: string;
  runtimeClassesAvailable?: boolean;
  heavyInitializationRequired?: boolean;
  detectedModels?: NativeMaskingDetectedModel[];
  modelLoaded?: boolean;
  inferenceRan?: boolean;
  maskPngWritten?: boolean;
  modelName?: string;
  modelAssetPath?: string;
  modelStatus?: NativeMaskingModelStatus;
  lastInferenceError?: string;
  inferenceBackend?: string;
  errorCode?: string;
  maskInputSize?: number;
  memory?: NativeMaskingMemorySnapshot;
  memoryBeforeLoad?: NativeMaskingMemorySnapshot;
  memoryAfterLoad?: NativeMaskingMemorySnapshot;
  fallbackUsed?: boolean;
  activeMaskingEngine?: string;
  maskingEngineStatus?: NativeMaskingEngineStatus;
  warnings?: string[];
  errors?: string[];
}

export interface NativeMaskingFrameInput {
  rotationId: RotationId;
  frameIndex: number;
  frameUri?: string;
  videoUri?: string;
  videoSampleIndex?: number;
  videoSampleCount?: number;
  videoSampleTimeMs?: number;
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
  modelPreference?: NativeMaskingModelPreference;
  maskInputSize?: 192 | 256 | 320 | 512;
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
  inferenceTimeMs?: number;
  confidenceThreshold?: number;
  inputFramePath?: string;
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
  mlKitAvailable?: boolean;
  defaultMaskingEngine?: string;
  confidenceThreshold?: number;
  modelTier?: string;
  modelPreference?: NativeMaskingModelPreference;
  modelAssetPath?: string;
  modelFileSize?: number;
  maskInputSize?: number;
  errorCode?: string;
  memoryBeforeLoad?: NativeMaskingMemorySnapshot;
  memoryAfterLoad?: NativeMaskingMemorySnapshot;
  modelLoaded?: boolean;
  inferenceRan?: boolean;
  maskPngWritten?: boolean;
  modelStatus?: NativeMaskingModelStatus;
  lastInferenceError?: string;
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
  mlKitAvailable?: boolean;
  defaultMaskingEngine?: string;
  confidenceThreshold?: number;
  modelExists?: boolean;
  modelTier?: string;
  modelPreference?: NativeMaskingModelPreference;
  modelFileSize?: number;
  maskInputSize?: number;
  errorCode?: string;
  memoryBeforeLoad?: NativeMaskingMemorySnapshot;
  memoryAfterLoad?: NativeMaskingMemorySnapshot;
  modelLoaded?: boolean;
  inferenceRan?: boolean;
  maskPngWritten?: boolean;
  modelStatus?: NativeMaskingModelStatus;
  lastInferenceError?: string;
  modelName?: string;
  engineName?: string;
  modelAssetPath?: string;
  inferenceBackend?: string;
  fallbackUsed?: boolean;
  activeMaskingEngine?: string;
  maskingEngineStatus?: NativeMaskingEngineStatus;
  warnings: string[];
  errors: string[];
}
