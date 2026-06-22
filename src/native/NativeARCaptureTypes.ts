import {
  CameraExposureMetadata,
  CameraExtrinsics,
  CameraIntrinsics,
  CameraLensMetadata,
  CaptureSource,
  PreferredLens,
  RotationId
} from "../core/manifest";

export type NativeARCaptureStatus =
  | "ready"
  | "not-started"
  | "tracked"
  | "untracked"
  | "timed-capture-running"
  | "ended"
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

export interface NativeARCaptureSettings {
  lockExposure?: boolean;
  lockWhiteBalance?: boolean;
  lockFocus?: boolean;
  preferredLens?: PreferredLens;
  keyframeIntervalMs?: number;
  maxKeyframes?: number;
  minKeyframes?: number;
  imageResolutionPreset?: "low" | "medium" | "high";
  objectScanMode?: boolean;
  manualIso?: number;
  manualShutterNs?: number;
}

export interface NativeARCaptureAvailability {
  available: boolean;
  moduleName: "ForgeScanARCapture";
  engineVersion?: string;
  arCoreRuntimePresent?: boolean;
  arCoreAvailable?: boolean;
  arCoreAvailability?: string;
  availabilityTransient?: boolean;
  sharedCameraSupported?: boolean;
  sharedCameraSessionStarted?: boolean;
  camera2Available?: boolean;
  supportedPhysicalCameras?: string[];
  supportedLensOptions?: PreferredLens[];
  canLockExposure?: boolean;
  canLockWhiteBalance?: boolean;
  canLockFocus?: boolean;
  activityAttached?: boolean;
  trackingState?: string;
  sessionRunning?: boolean;
  timedCaptureRunning?: boolean;
  keyframeCaptureImplemented?: boolean;
  fallbackTurntablePoseUsed?: boolean;
  cameraIntrinsicsCaptured?: boolean;
  cameraExtrinsicsCaptured?: boolean;
  keyframeCount?: number;
  keyframesPath?: string;
  keyframesUri?: string;
  keyframesBytes?: number;
  lastKeyframePath?: string;
  lastPoseMatrix?: number[];
  lastNativeError?: string;
  warnings: string[];
  errors: string[];
}

export interface NativeARCaptureSessionInput extends NativeARCaptureSettings {
  projectId: string;
  projectName?: string;
  projectDirectoryUri?: string;
  outputDirectory?: "advanced/camera";
}

export interface NativeARCaptureKeyframeInput extends NativeARCaptureSettings {
  projectId: string;
  rotationId: RotationId;
  frameIndex: number;
  sourceFrameUri: string;
  projectDirectoryUri?: string;
  width?: number;
  height?: number;
  timestamp?: string;
  outputDirectory?: "advanced/camera";
}

export interface NativeARCaptureTimedInput extends NativeARCaptureSettings {
  projectId: string;
  rotationId?: RotationId;
  projectDirectoryUri?: string;
  sourceFrames?: NativeARCaptureFrameInput[];
  outputDirectory?: "advanced/camera";
}

export interface NativeARCaptureKeyframe {
  frameUri: string;
  framePath: string;
  sourceFrameUri?: string;
  timestamp: string;
  frameIndex: number;
  rotationId: RotationId;
  captureSource: CaptureSource;
  trackingState?: string;
  cameraTransformConvention?: string;
  cameraIntrinsics?: CameraIntrinsics;
  cameraExtrinsics?: CameraExtrinsics;
  exposureMetadata?: CameraExposureMetadata;
  lensMetadata?: CameraLensMetadata;
}

export interface NativeARCaptureResult extends NativeARCaptureAvailability {
  status: NativeARCaptureStatus;
  message?: string;
  frameUri?: string;
  framePath?: string;
  captureSource?: CaptureSource;
  keyframe?: NativeARCaptureKeyframe;
  sourceFrameCount?: number;
}

export interface NativeARCaptureInput {
  projectId: string;
  frames: NativeARCaptureFrameInput[];
  outputDirectory: "advanced/camera";
}

export type NativeARCaptureSmokeResult = NativeARCaptureResult;
