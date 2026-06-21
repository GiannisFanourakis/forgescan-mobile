import { CapturedFrame, ForgeScanProjectManifest, RotationId } from "../core/manifest";
import { writeProjectFile } from "../storage/projectStorage";
import { SegmentationEngine } from "./SegmentationEngine";
import {
  FrameMaskArtifact,
  MaskPreviewOverlayData,
  SegmentationFrameResult,
  SegmentationProjectResult,
  SegmentationRotationResult
} from "./SegmentationTypes";
import {
  createRawMaskPath,
  createRefinedMaskPath
} from "./maskPaths";

const fallbackMaskPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

export class LocalSegmentationEngine implements SegmentationEngine {
  async runSegmentationForProject(
    manifest: ForgeScanProjectManifest
  ): Promise<SegmentationProjectResult> {
    const rotationResults: SegmentationRotationResult[] = [];

    for (const rotation of manifest.capture.rotations) {
      if (rotation.frames.length === 0) {
        continue;
      }

      rotationResults.push(
        await this.runSegmentationForRotation(manifest, rotation.id)
      );
    }

    const artifacts = rotationResults.flatMap((result) => result.artifacts);
    const previews = rotationResults.flatMap((result) => result.previews);
    const errors = rotationResults.flatMap((result) => result.errors);
    const result: SegmentationProjectResult = {
      projectId: manifest.project.id,
      status: errors.length > 0 ? "failed" : "complete",
      engine: "fallback-local",
      createdAt: new Date().toISOString(),
      totalFrames: artifacts.length,
      successfulFrames: artifacts.filter(
        (artifact) => artifact.status === "complete"
      ).length,
      failedFrames: artifacts.filter((artifact) => artifact.status === "failed")
        .length,
      artifacts,
      previews,
      rotationResults,
      errors,
      notes: [
        "Fallback segmentation - replace with AI model.",
        "Expo fallback writes deterministic one-pixel PNG mask artifacts for every captured frame."
      ]
    };

    writeProjectFile(
      manifest,
      "masks/segmentation-result.json",
      JSON.stringify(result, null, 2)
    );

    return result;
  }

  async runSegmentationForRotation(
    manifest: ForgeScanProjectManifest,
    rotationId: RotationId
  ): Promise<SegmentationRotationResult> {
    const rotation = manifest.capture.rotations.find(
      (candidate) => candidate.id === rotationId
    );

    if (!rotation) {
      return {
        rotationId,
        totalFrames: 0,
        successfulFrames: 0,
        failedFrames: 0,
        artifacts: [],
        previews: [],
        errors: [`Rotation ${rotationId} not found.`]
      };
    }

    const frameResults: SegmentationFrameResult[] = [];
    const errors: string[] = [];

    for (const frame of rotation.frames) {
      try {
        frameResults.push(
          await this.runSegmentationForFrame(manifest, rotationId, frame)
        );
      } catch (error: unknown) {
        errors.push(
          error instanceof Error
            ? error.message
            : `Segmentation failed for ${rotationId} frame ${frame.index}.`
        );
      }
    }

    return {
      rotationId,
      totalFrames: rotation.frames.length,
      successfulFrames: frameResults.length,
      failedFrames: Math.max(0, rotation.frames.length - frameResults.length),
      artifacts: frameResults.map((result) => result.artifact),
      previews: frameResults.map((result) => result.preview),
      errors
    };
  }

  async runSegmentationForFrame(
    manifest: ForgeScanProjectManifest,
    rotationId: RotationId,
    frame: CapturedFrame
  ): Promise<SegmentationFrameResult> {
    const artifact: FrameMaskArtifact = {
      rotationId,
      frameIndex: frame.index,
      sourceFrameUri: frame.uri,
      rawMaskPath: createRawMaskPath(rotationId, frame.index),
      refinedMaskPath: createRefinedMaskPath(rotationId, frame.index),
      status: "planned",
      notes: ["Fallback segmentation - replace with AI model."]
    };
    const rawMaskUri = this.saveRawMask(manifest, artifact);
    const refinedMaskUri = this.saveRefinedMask(manifest, artifact);
    const completedArtifact: FrameMaskArtifact = {
      ...artifact,
      rawMaskUri,
      refinedMaskUri,
      status: "complete",
      createdAt: new Date().toISOString()
    };

    writeProjectFile(
      manifest,
      `${artifact.refinedMaskPath}.json`,
      JSON.stringify(completedArtifact, null, 2)
    );

    return {
      frame,
      artifact: completedArtifact,
      preview: this.createMaskPreviewOverlayData(completedArtifact)
    };
  }

  saveRawMask(
    manifest: ForgeScanProjectManifest,
    artifact: FrameMaskArtifact
  ): string {
    return writeProjectFile(manifest, artifact.rawMaskPath, fallbackMaskPng);
  }

  saveRefinedMask(
    manifest: ForgeScanProjectManifest,
    artifact: FrameMaskArtifact
  ): string {
    return writeProjectFile(manifest, artifact.refinedMaskPath, fallbackMaskPng);
  }

  createMaskPreviewOverlayData(
    artifact: FrameMaskArtifact
  ): MaskPreviewOverlayData {
    return {
      rotationId: artifact.rotationId,
      frameIndex: artifact.frameIndex,
      sourceFrameUri: artifact.sourceFrameUri,
      ...(artifact.refinedMaskUri ? { maskUri: artifact.refinedMaskUri } : {}),
      opacity: 0.45,
      bounds: {
        x: 0.12,
        y: 0.1,
        width: 0.76,
        height: 0.8
      }
    };
  }
}

export const localSegmentationEngine = new LocalSegmentationEngine();

export function runSegmentationForProject(
  manifest: ForgeScanProjectManifest
): Promise<SegmentationProjectResult> {
  return localSegmentationEngine.runSegmentationForProject(manifest);
}
