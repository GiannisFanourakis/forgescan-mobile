import { RotationId } from "../core/manifest";

export type NativeMaskingAvailabilityMode = "native-ai" | "unavailable";
export type NativeMaskingModelHint = "birefnet-object-background";
export type NativeMaskingDesiredFormat = "png";

export interface NativeMaskingAvailability {
  available: boolean;
  mode: NativeMaskingAvailabilityMode;
  moduleName: "ForgeScanNativeMasking";
  reason?: string;
  engineName?: string;
  engineVersion?: string;
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
  status: "complete" | "failed";
  warnings: string[];
  errors: string[];
}

export interface NativeMaskingOutput {
  status: "complete" | "requires-native-build" | "failed";
  maskArtifacts: NativeMaskArtifactOutput[];
  engineName: string;
  engineVersion?: string;
  modelName: NativeMaskingModelHint;
  warnings: string[];
  errors: string[];
}
