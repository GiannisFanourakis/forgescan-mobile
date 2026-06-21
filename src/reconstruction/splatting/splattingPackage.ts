import { ForgeScanProjectManifest } from "../../core/manifest";
import { createExpectedMaskArtifacts } from "../../core/segmentationPlan";
import { writeProjectFile } from "../../storage/projectStorage";

export interface SplattingFrameEntry {
  rotationId: string;
  frameIndex: number;
  frameUri: string;
  maskPath: string;
  order: number;
}

export interface SplattingInputPackage {
  projectId: string;
  projectTitle: string;
  createdAt: string;
  status: "package-ready";
  note: string;
  frames: SplattingFrameEntry[];
  cameraAssumptions: {
    motion: "turntable-orbit";
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
  const frames = manifest.capture.rotations.flatMap((rotation) =>
    rotation.frames.map((frame, index) => {
      const mask = maskArtifacts.find(
        (artifact) =>
          artifact.rotationId === rotation.id && artifact.frameIndex === frame.index
      );
      return {
        rotationId: rotation.id,
        frameIndex: frame.index,
        frameUri: frame.uri,
        maskPath: mask?.refinedMaskPath ?? "",
        order: index + 1
      };
    })
  );

  return {
    projectId: manifest.project.id,
    projectTitle: manifest.project.title,
    createdAt: new Date().toISOString(),
    status: "package-ready",
    note:
      "Gaussian Splatting is packaged for an external/native optimizer; optimization is not run inside Expo Go.",
    frames,
    cameraAssumptions: {
      motion: "turntable-orbit",
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
      "reconstruction/splats/point_cloud.ply",
      "reconstruction/splats/model.ksplat",
      "exports/viewer.html"
    ]
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
  writeProjectFile(manifest, "reconstruction/splatting-job.json", json);
  writeProjectFile(manifest, "exports/splatting-job.json", json);
  saveSplattingFramesManifest(manifest);
  return splattingPackage;
}
