import { RotationId } from "../core/manifest";

export type KsplatOptimizerMode =
  | "native-on-device"
  | "requires-native-build"
  | "failed";

export type KsplatOptimizerStatus =
  | "not-started"
  | "preparing"
  | "processing"
  | "generated"
  | "requires-native-build"
  | "failed";

export type KsplatQualityTier =
  | "none"
  | "smoke-test"
  | "trainable-v1"
  | "coarse-v1"
  | "production-3dgs";

export type KsplatEngineStatus =
  | "production-3dgs-running"
  | "trainable-3dgs-v1-running"
  | "coarse-v1-fallback"
  | "generated"
  | "coarse-v1-running"
  | "coarse-v1-generated"
  | "production-3dgs-missing"
  | "failed";

export type KsplatWriterStatus =
  | "valid-ksplat"
  | "experimental-ksplat"
  | "unsupported";

export interface OrderedFrameInput {
  rotationId: RotationId;
  frameIndex: number;
  frameUri: string;
  order: number;
}

export interface ObjectMaskInput {
  rotationId: RotationId;
  frameIndex: number;
  refinedMaskPath: string;
  refinedMaskUri?: string;
}

export interface RotationOptimizerMetadata {
  rotationId: RotationId;
  label: string;
  required: boolean;
  frameCount: number;
  status: string;
}

export interface CameraFrameData {
  rotationId: RotationId;
  frameIndex: number;
  frameUri: string;
  assumedPose: {
    yawDegrees: number;
    tiltDegrees: number;
  };
}

export interface KsplatCameraData {
  cameraModel: "unknown-mobile-camera";
  poseSource: "ordered-turntable-fallback";
  motion: "controlled-object-turntable";
  frames: CameraFrameData[];
}

export interface KsplatOptimizerSettings {
  target: "ksplat";
  maxIterations: number;
  gaussianCount: number;
  imageDownscale: number;
  learningRate: number;
  qualityPreset: "smoke" | "fast" | "standard";
  useMasks: boolean;
  nativePreferred: boolean;
  objectTurntableMode: boolean;
}
