import { ForgeScanProjectManifest } from "../core/manifest";
import {
  getExpectedKsplatPath,
  getPhotorealAssetFilename
} from "../reconstruction/splatting/photorealAsset";
import { MaskArtifact } from "../masking/MaskingTypes";
import {
  KsplatCameraData,
  KsplatOptimizerSettings,
  ObjectMaskInput,
  OrderedFrameInput,
  RotationOptimizerMetadata
} from "./KsplatTypes";

export interface KsplatOptimizerInput {
  projectId: string;
  projectName: string;
  orderedFrames: OrderedFrameInput[];
  objectMasks: ObjectMaskInput[];
  cameraData: KsplatCameraData;
  rotationMetadata: RotationOptimizerMetadata[];
  outputFilename: string;
  outputDirectory: string;
  outputPath: string;
  optimizerSettings: KsplatOptimizerSettings;
  frameSampling: {
    targetKeyframeIntervalSeconds: number;
    targetFrames: string;
  };
  createdAt: string;
  notes: string[];
}

export function createKsplatOptimizerInput(
  manifest: ForgeScanProjectManifest,
  masks: MaskArtifact[] = []
): KsplatOptimizerInput {
  let order = 0;
  const orderedFrames = manifest.capture.rotations.flatMap((rotation) =>
    rotation.frames.map((frame) => {
      order += 1;
      return {
        rotationId: rotation.id,
        frameIndex: frame.index,
        frameUri: frame.uri,
        order,
        ...(frame.captureSource !== undefined
          ? { captureSource: frame.captureSource }
          : {}),
        ...(frame.timestamp !== undefined ? { timestamp: frame.timestamp } : {}),
        ...(frame.cameraIntrinsics !== undefined
          ? { cameraIntrinsics: frame.cameraIntrinsics }
          : {}),
        ...(frame.cameraExtrinsics !== undefined
          ? { cameraExtrinsics: frame.cameraExtrinsics }
          : {}),
        ...(frame.trackingState !== undefined ? { trackingState: frame.trackingState } : {}),
        ...(frame.exposureMetadata !== undefined
          ? { exposureMetadata: frame.exposureMetadata }
          : {}),
        ...(frame.lensMetadata !== undefined ? { lensMetadata: frame.lensMetadata } : {})
      };
    })
  );
  const cameraData = createCameraData(manifest);

  return {
    projectId: manifest.project.id,
    projectName: manifest.project.title,
    orderedFrames,
    objectMasks: masks.map((mask) => {
      const objectMask: ObjectMaskInput = {
        rotationId: mask.rotationId,
        frameIndex: mask.frameIndex,
        refinedMaskPath: mask.refinedMaskPath
      };

      if (mask.refinedMaskUri !== undefined) {
        objectMask.refinedMaskUri = mask.refinedMaskUri;
      }

      return objectMask;
    }),
    cameraData,
    rotationMetadata: manifest.capture.rotations.map((rotation) => ({
      rotationId: rotation.id,
      label: rotation.label,
      required: rotation.required,
      frameCount: rotation.frames.length,
      status: rotation.status
    })),
    outputFilename: getPhotorealAssetFilename(manifest),
    outputDirectory: "photoreal",
    outputPath: getExpectedKsplatPath(manifest),
    optimizerSettings: {
      target: "ksplat",
      maxIterations: 18,
      gaussianCount: orderedFrames.length >= 180 ? 900 : 600,
      imageDownscale: orderedFrames.length >= 180 ? 2 : 1,
      learningRate: 0.08,
      qualityPreset: "smoke",
      useMasks: masks.length > 0,
      nativePreferred: true,
      objectTurntableMode: true,
      objectMaskThreshold: 0.85,
      poseSource: cameraData.poseSource,
      useCameraPoses: cameraData.poseSource === "arcore-shared-camera"
    },
    frameSampling: {
      targetKeyframeIntervalSeconds: 0.5,
      targetFrames: "40-60"
    },
    createdAt: new Date().toISOString(),
    notes: [
      "Native .ksplat optimizer input package for controlled object splatting.",
      "Expo Go writes this package internally but does not generate a fake .ksplat.",
      ...cameraData.warnings
    ]
  };
}

function createCameraData(
  manifest: ForgeScanProjectManifest
): KsplatCameraData {
  const allFrames = manifest.capture.rotations.flatMap((rotation) =>
    rotation.frames.map((frame, index) => ({
      frame,
      rotation,
      index
    }))
  );
  const trackedFrames = allFrames.filter(
    ({ frame }) =>
      frame.captureSource === "arcore-shared-camera" &&
      frame.cameraIntrinsics !== undefined &&
      frame.cameraExtrinsics?.transform?.length === 16 &&
      frame.trackingState === "TRACKING"
  );
  const hasTrackedPose = trackedFrames.length > 0;
  const untrackedFrameCount = allFrames.length - trackedFrames.length;
  const warnings = hasTrackedPose
    ? untrackedFrameCount > 0
      ? [
          "Some frames are missing ARCore pose metadata and may be ignored or use turntable assumptions."
        ]
      : []
    : [
        "Camera pose metadata missing. Using turntable assumptions.",
        "Untracked capture does not contain camera pose matrices. Results may fail or use rough turntable assumptions."
      ];

  return {
    cameraModel: "unknown-mobile-camera",
    poseSource: hasTrackedPose ? "arcore-shared-camera" : "ordered-turntable-fallback",
    motion: "controlled-object-turntable",
    fallbackTurntablePoseUsed: !hasTrackedPose,
    trackedFrameCount: trackedFrames.length,
    untrackedFrameCount,
    warnings,
    frames: allFrames.map(({ frame, rotation, index }) => ({
        rotationId: rotation.id,
        frameIndex: frame.index,
        frameUri: frame.uri,
        ...(frame.captureSource !== undefined
          ? { captureSource: frame.captureSource }
          : {}),
        ...(frame.cameraIntrinsics !== undefined
          ? { cameraIntrinsics: frame.cameraIntrinsics }
          : {}),
        ...(frame.cameraExtrinsics !== undefined
          ? { cameraExtrinsics: frame.cameraExtrinsics }
          : {}),
        ...(frame.trackingState !== undefined ? { trackingState: frame.trackingState } : {}),
        ...(frame.timestamp !== undefined ? { timestamp: frame.timestamp } : {}),
        assumedPose: {
          yawDegrees:
            rotation.frames.length > 0
              ? Math.round((index / rotation.frames.length) * 360)
              : 0,
          tiltDegrees:
            rotation.id === "upright"
              ? 0
              : rotation.id === "tilted"
                ? 45
              : 160
        }
      }))
  };
}
