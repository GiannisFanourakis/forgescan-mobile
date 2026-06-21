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
  imageDownscale: number;
  useMasks: boolean;
  nativePreferred: boolean;
}
