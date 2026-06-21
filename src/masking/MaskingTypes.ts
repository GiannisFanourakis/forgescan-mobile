import {
  CapturedFrame,
  ForgeScanProjectManifest,
  RotationId
} from "../core/manifest";

export type MaskingEngineMode = "native-ai" | "fallback-local" | "unavailable";
export type MaskingModelStatus =
  | "loaded"
  | "not-loaded"
  | "missing"
  | "load-failed"
  | "inference-failed"
  | "oom"
  | "oom-guard"
  | "full-model-disabled";
export type MaskingEngineStatus =
  | "mlkit-running"
  | "mlkit-complete"
  | "available-not-loaded"
  | "fallback-local"
  | "failed";

export type MaskingStatus =
  | "not-started"
  | "processing"
  | "complete"
  | "requires-native-build"
  | "failed";

export type MaskArtifactStatus = "processing" | "complete" | "failed";

export interface MaskArtifact {
  rotationId: RotationId;
  frameIndex: number;
  sourceFrameUri: string;
  rawMaskUri?: string;
  refinedMaskUri?: string;
  rawMaskPath: string;
  refinedMaskPath: string;
  status: MaskArtifactStatus;
  engine: MaskingEngineMode;
  engineName?: string;
  modelName?: string;
  modelLoaded?: boolean;
  inferenceRan?: boolean;
  maskPngWritten?: boolean;
  createdAt?: string;
  warnings: string[];
  errors: string[];
}

export interface MaskingFrameResult {
  frame: CapturedFrame;
  artifact: MaskArtifact;
}

export interface MaskingRotationResult {
  rotationId: RotationId;
  status: MaskingStatus;
  totalFrames: number;
  successfulFrames: number;
  failedFrames: number;
  artifacts: MaskArtifact[];
  warnings: string[];
  errors: string[];
}

export interface MaskingProjectResult {
  projectId: string;
  status: MaskingStatus;
  engine: MaskingEngineMode;
  engineName: string;
  engineVersion?: string;
  modelName?: string;
  modelExists?: boolean;
  modelLoaded?: boolean;
  inferenceRan?: boolean;
  maskPngWritten?: boolean;
  modelStatus?: MaskingModelStatus;
  maskingEngineStatus?: MaskingEngineStatus;
  createdAt: string;
  totalFrames: number;
  successfulFrames: number;
  failedFrames: number;
  artifacts: MaskArtifact[];
  rotationResults: MaskingRotationResult[];
  warnings: string[];
  errors: string[];
}

export interface MaskCoverageValidation {
  status: MaskingStatus;
  requiredFrames: number;
  maskCount: number;
  complete: boolean;
  warnings: string[];
  errors: string[];
}

export interface MaskingSummary {
  status: MaskingStatus;
  engine: MaskingEngineMode;
  totalFrames: number;
  maskCount: number;
  requiredFrames: number;
  userMessage: string;
  warnings: string[];
  errors: string[];
}

export interface MaskingEngine {
  mode: MaskingEngineMode;
  runMaskingForProject(
    manifest: ForgeScanProjectManifest
  ): Promise<MaskingProjectResult>;
  runMaskingForRotation(
    manifest: ForgeScanProjectManifest,
    rotationId: RotationId
  ): Promise<MaskingRotationResult>;
  runMaskingForFrame(
    manifest: ForgeScanProjectManifest,
    rotationId: RotationId,
    frame: CapturedFrame
  ): Promise<MaskingFrameResult>;
}
