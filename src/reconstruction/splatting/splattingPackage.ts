import { ForgeScanProjectManifest } from "../../core/manifest";
import { createExpectedMaskArtifacts } from "../../core/segmentationPlan";
import { writeProjectFile } from "../../storage/projectStorage";
import {
  PhotorealAsset,
  createPhotorealAsset,
  getExpectedKsplatPath
} from "./photorealAsset";

export interface SplattingFrameEntry {
  rotationId: string;
  frameIndex: number;
  frameUri: string;
  maskPath: string;
  order: number;
}

export interface SplattingCameraFrame {
  rotationId: string;
  frameIndex: number;
  frameUri: string;
  assumedPose: {
    yawDegrees: number;
    tiltDegrees: number;
  };
}

export interface SplattingCameraData {
  cameraModel: "unknown-mobile-camera";
  poseSource: "ordered-turntable-fallback";
  motion: "controlled-object-turntable";
  frames: SplattingCameraFrame[];
}

export interface SplattingInputPackage {
  projectId: string;
  projectTitle: string;
  createdAt: string;
  status: "package-ready";
  note: string;
  primaryOutput: string;
  optionalIntermediate: string;
  viewerTarget: string;
  photorealAsset: PhotorealAsset;
  frames: SplattingFrameEntry[];
  masks: string[];
  rotationMetadata: Array<{
    rotationId: string;
    label: string;
    required: boolean;
    frameCount: number;
    status: string;
  }>;
  cameraDataPath: string;
  cameraAssumptions: {
    motion: "controlled-object-turntable";
    intrinsics: "unknown-mobile-camera";
    poseSource: "ordered-frame-fallback";
  };
  optimizerSettings: {
    target: "3d-gaussian-splatting";
    maxIterations: number;
    imageDownscale: number;
    useMasks: boolean;
  };
  expectedOutputFiles: string[];
}

export function createSplattingInputPackage(
  manifest: ForgeScanProjectManifest
): SplattingInputPackage {
  const maskArtifacts = createExpectedMaskArtifacts(manifest);
  let order = 0;
  const frames = manifest.capture.rotations.flatMap((rotation) =>
    rotation.frames.map((frame) => {
      const mask = maskArtifacts.find(
        (artifact) =>
          artifact.rotationId === rotation.id && artifact.frameIndex === frame.index
      );
      order += 1;
      return {
        rotationId: rotation.id,
        frameIndex: frame.index,
        frameUri: frame.uri,
        maskPath: mask?.refinedMaskPath ?? "",
        order
      };
    })
  );
  const primaryOutput = getExpectedKsplatPath(manifest);

  return {
    projectId: manifest.project.id,
    projectTitle: manifest.project.title,
    createdAt: new Date().toISOString(),
    status: "package-ready",
    note:
      "Controlled object splatting is packaged for the native .ksplat optimizer; Expo Go cannot run the native optimizer.",
    primaryOutput,
    optionalIntermediate: "photoreal/splat.ply",
    viewerTarget: "open_viewer.html",
    photorealAsset: createPhotorealAsset(
      manifest,
      "requires-native-build"
    ),
    frames,
    masks: maskArtifacts.map((artifact) => artifact.refinedMaskPath),
    rotationMetadata: manifest.capture.rotations.map((rotation) => ({
      rotationId: rotation.id,
      label: rotation.label,
      required: rotation.required,
      frameCount: rotation.frames.length,
      status: rotation.status
    })),
    cameraDataPath: "photoreal/cameras.json",
    cameraAssumptions: {
      motion: "controlled-object-turntable",
      intrinsics: "unknown-mobile-camera",
      poseSource: "ordered-frame-fallback"
    },
    optimizerSettings: {
      target: "3d-gaussian-splatting",
      maxIterations: 7000,
      imageDownscale: frames.length >= 180 ? 2 : 1,
      useMasks: true
    },
    expectedOutputFiles: [
      primaryOutput,
      "photoreal/splat.ply",
      "preview/preview.mp4",
      "preview/preview.gif"
    ]
  };
}

export function createSplattingCameraData(
  manifest: ForgeScanProjectManifest
): SplattingCameraData {
  return {
    cameraModel: "unknown-mobile-camera",
    poseSource: "ordered-turntable-fallback",
    motion: "controlled-object-turntable",
    frames: manifest.capture.rotations.flatMap((rotation) =>
      rotation.frames.map((frame, index) => ({
        rotationId: rotation.id,
        frameIndex: frame.index,
        frameUri: frame.uri,
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
    )
  };
}

export function saveSplattingFramesManifest(
  manifest: ForgeScanProjectManifest
): string {
  const splattingPackage = createSplattingInputPackage(manifest);
  return writeProjectFile(
    manifest,
    "reconstruction/splatting-frames.json",
    JSON.stringify(splattingPackage.frames, null, 2)
  );
}

export function exportSplattingJob(
  manifest: ForgeScanProjectManifest
): SplattingInputPackage {
  const splattingPackage = createSplattingInputPackage(manifest);
  const json = JSON.stringify(splattingPackage, null, 2);
  writeProjectFile(
    manifest,
    "photoreal/cameras.json",
    JSON.stringify(createSplattingCameraData(manifest), null, 2)
  );
  writeProjectFile(manifest, "photoreal/splatting-job.json", json);
  writeProjectFile(manifest, "reconstruction/splatting-job.json", json);
  writeProjectFile(manifest, "exports/splatting-job.json", json);
  saveSplattingFramesManifest(manifest);
  return splattingPackage;
}
