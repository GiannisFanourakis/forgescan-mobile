import { RotationId } from "../core/manifest";

export type NativeARCaptureStatus =
  | "ready"
  | "fallback-turntable"
  | "requires-native-build"
  | "failed";

export interface NativeARCaptureFrameInput {
  rotationId: RotationId;
  frameIndex: number;
  frameUri: string;
  width?: number;
  height?: number;
  capturedAt?: string;
}

export interface NativeARCaptureAvailability {
  available: boolean;
  moduleName: "ForgeScanARCapture";
  engineVersion?: string;
  arCoreRuntimePresent?: boolean;
  arCoreAvailable?: boolean;
  arCoreAvailability?: string;
  availabilityTransient?: boolean;
  activityAttached?: boolean;
  trackingState?: string;
  keyframeCaptureImplemented?: boolean;
  fallbackTurntablePoseUsed?: boolean;
  cameraIntrinsicsCaptured?: boolean;
  cameraExtrinsicsCaptured?: boolean;
  keyframeCount?: number;
  warnings: string[];
  errors: string[];
}

export interface NativeARCaptureInput {
  projectId: string;
  frames: NativeARCaptureFrameInput[];
  outputDirectory: "advanced/camera";
}

export interface NativeARCaptureSmokeResult extends NativeARCaptureAvailability {
  status: NativeARCaptureStatus;
  keyframesPath?: string;
  keyframesUri?: string;
  keyframesBytes?: number;
}
