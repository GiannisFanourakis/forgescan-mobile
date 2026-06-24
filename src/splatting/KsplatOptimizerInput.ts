import {
  TrackedCaptureReadiness,
  getFramePoseReadiness,
  validateTrackedCaptureForSplat
} from "../capture/trackedCaptureReadiness";
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
  trackedCaptureReadiness: TrackedCaptureReadiness;
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
  const trackedCaptureReadiness = validateTrackedCaptureForSplat(manifest);
  const capturedOrderedFrames = manifest.capture.rotations.flatMap((rotation) =>
    rotation.frames.map((frame) => {
      order += 1;
      const readiness = getFramePoseReadiness(frame);
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
        poseSynchronization: readiness.poseSynchronization,
        hasIntrinsics: readiness.hasIntrinsics,
        hasExtrinsics: readiness.hasExtrinsics,
        hasValidPoseMatrix: readiness.hasValidPoseMatrix,
        usableForSplat: readiness.usableForSplat,
        ...(readiness.unusableReason !== undefined
          ? { unusableReason: readiness.unusableReason }
          : {}),
        ...(frame.exposureMetadata !== undefined
          ? { exposureMetadata: frame.exposureMetadata }
          : {}),
        ...(frame.lensMetadata !== undefined ? { lensMetadata: frame.lensMetadata } : {})
      };
    })
  );
  const orderedFrames =
    capturedOrderedFrames.length > 0
      ? capturedOrderedFrames
      : createOrderedFramesFromMaskArtifacts(masks);
  const cameraData = createCameraData(
    manifest,
    trackedCaptureReadiness,
    orderedFrames
  );

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
    trackedCaptureReadiness,
    rotationMetadata: manifest.capture.rotations.map((rotation) => ({
      rotationId: rotation.id,
      label: rotation.label,
      required: rotation.required,
      frameCount:
        rotation.frames.length +
        (rotation.videos?.length ?? 0) * 96,
      status: rotation.status
    })),
    outputFilename: getPhotorealAssetFilename(manifest),
    outputDirectory: "photoreal",
    outputPath: getExpectedKsplatPath(manifest),
    optimizerSettings: {
      target: "ksplat",
      maxIterations: 42,
      gaussianCount: orderedFrames.length >= 180 ? 42000 : 28000,
      imageDownscale: 1,
      learningRate: 0.08,
      qualityPreset: "standard",
      useMasks: masks.length > 0,
      nativePreferred: true,
      objectTurntableMode: true,
      objectMaskThreshold: 0.85,
      poseSource: cameraData.poseSource,
      useCameraPoses: cameraData.poseSource === "arcore-shared-camera"
    },
    frameSampling: {
      targetKeyframeIntervalSeconds: 0.5,
      targetFrames: "96+"
    },
    createdAt: new Date().toISOString(),
    notes: [
      "Native .ksplat optimizer input package for controlled object splatting.",
      "Expo Go writes this package internally but does not generate a fake .ksplat.",
      `Tracked capture readiness: ${trackedCaptureReadiness.status}.`,
      ...trackedCaptureReadiness.warnings,
      ...cameraData.warnings
    ]
  };
}

function createCameraData(
  manifest: ForgeScanProjectManifest,
  trackedCaptureReadiness: TrackedCaptureReadiness,
  orderedFrames: OrderedFrameInput[]
): KsplatCameraData {
  const allFrames = manifest.capture.rotations.flatMap((rotation) =>
    rotation.frames.map((frame, index) => ({
      frame,
      rotation,
      index
    }))
  );
  const trackedFrames = allFrames.filter(
    ({ frame }) => getFramePoseReadiness(frame).usableForSplat
  );
  const hasTrackedPose = trackedFrames.length > 0;
  const untrackedFrameCount =
    allFrames.length > 0
      ? allFrames.length - trackedFrames.length
      : orderedFrames.length;
  const warnings = [
    ...trackedCaptureReadiness.warnings,
    ...(hasTrackedPose && untrackedFrameCount > 0
      ? [
          "Some frames are missing ARCore pose metadata and may be ignored or use turntable assumptions."
        ]
      : []),
    ...(!hasTrackedPose
      ? [
          "Fixed-camera turntable video selected. Object rotation angles are inferred from frame order.",
          "Keep the camera still and capture one smooth full object rotation for best splat quality."
        ]
      : [])
  ];

  return {
    cameraModel: "unknown-mobile-camera",
    poseSource: hasTrackedPose ? "arcore-shared-camera" : "fixed-camera-turntable",
    motion: "controlled-object-turntable",
    fallbackTurntablePoseUsed: false,
    trackedFrameCount: trackedFrames.length,
    untrackedFrameCount,
    warnings: [...new Set(warnings)],
    frames:
      allFrames.length > 0
        ? allFrames.map(({ frame, rotation, index }) => {
            const readiness = getFramePoseReadiness(frame);

            return {
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
              poseSynchronization: readiness.poseSynchronization,
              hasIntrinsics: readiness.hasIntrinsics,
              hasExtrinsics: readiness.hasExtrinsics,
              hasValidPoseMatrix: readiness.hasValidPoseMatrix,
              usableForSplat: readiness.usableForSplat,
              ...(readiness.unusableReason !== undefined
                ? { unusableReason: readiness.unusableReason }
                : {}),
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
            };
          })
        : orderedFrames.map((frame, index) => ({
            rotationId: frame.rotationId,
            frameIndex: frame.frameIndex,
            frameUri: frame.frameUri,
            ...(frame.captureSource !== undefined
              ? { captureSource: frame.captureSource }
              : {}),
            ...(frame.poseSynchronization !== undefined
              ? { poseSynchronization: frame.poseSynchronization }
              : {}),
            hasIntrinsics: false,
            hasExtrinsics: false,
            hasValidPoseMatrix: false,
            usableForSplat: true,
            assumedPose: {
              yawDegrees:
                orderedFrames.length > 0
                  ? Math.round((index / orderedFrames.length) * 360)
                  : 0,
              tiltDegrees:
                frame.rotationId === "upright"
                  ? 0
                  : frame.rotationId === "tilted"
                    ? 45
                    : 160
            }
          }))
  };
}

function createOrderedFramesFromMaskArtifacts(
  masks: MaskArtifact[]
): OrderedFrameInput[] {
  let order = 0;
  return masks
    .filter((mask) => mask.status === "complete" && mask.sourceFrameUri)
    .map((mask) => {
      order += 1;
      return {
        rotationId: mask.rotationId,
        frameIndex: mask.frameIndex,
        frameUri: mask.sourceFrameUri,
        order,
        captureSource: "imported",
        poseSynchronization: "turntable-assumed",
        hasIntrinsics: false,
        hasExtrinsics: false,
        hasValidPoseMatrix: false,
        usableForSplat: true
      };
    });
}
