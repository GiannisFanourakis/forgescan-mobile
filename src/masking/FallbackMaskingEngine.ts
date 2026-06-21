import {
  CapturedFrame,
  ForgeScanProjectManifest,
  RotationId
} from "../core/manifest";
import { writeProjectFile } from "../storage/projectStorage";
import {
  MaskArtifact,
  MaskingEngine,
  MaskingFrameResult,
  MaskingProjectResult,
  MaskingRotationResult
} from "./MaskingTypes";

const fallbackMaskPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

export class FallbackMaskingEngine implements MaskingEngine {
  mode = "fallback-local" as const;

  async runMaskingForProject(
    manifest: ForgeScanProjectManifest
  ): Promise<MaskingProjectResult> {
    const rotationResults: MaskingRotationResult[] = [];

    for (const rotation of manifest.capture.rotations) {
      if (rotation.frames.length === 0) {
        continue;
      }

      rotationResults.push(
        await this.runMaskingForRotation(manifest, rotation.id)
      );
    }

    const artifacts = rotationResults.flatMap((result) => result.artifacts);
    const warnings = [
      "Native AI masking requires a development/native build.",
      "Fallback local masking wrote deterministic internal PNG mask artifacts."
    ];
    const result: MaskingProjectResult = {
      projectId: manifest.project.id,
      status: "complete",
      engine: this.mode,
      engineName: "fallback-local-mask",
      engineVersion: "0.1.0",
      modelName: "fallback-local",
      createdAt: new Date().toISOString(),
      totalFrames: artifacts.length,
      successfulFrames: artifacts.filter(
        (artifact) => artifact.status === "complete"
      ).length,
      failedFrames: artifacts.filter((artifact) => artifact.status === "failed")
        .length,
      artifacts,
      rotationResults,
      warnings,
      errors: rotationResults.flatMap((rotation) => rotation.errors)
    };

    writeProjectFile(
      manifest,
      "advanced/masks/masking-result.json",
      JSON.stringify(result, null, 2)
    );

    return result;
  }

  async runMaskingForRotation(
    manifest: ForgeScanProjectManifest,
    rotationId: RotationId
  ): Promise<MaskingRotationResult> {
    const rotation = manifest.capture.rotations.find(
      (candidate) => candidate.id === rotationId
    );

    if (!rotation) {
      return {
        rotationId,
        status: "failed",
        totalFrames: 0,
        successfulFrames: 0,
        failedFrames: 0,
        artifacts: [],
        warnings: [],
        errors: [`Rotation ${rotationId} not found.`]
      };
    }

    const frameResults: MaskingFrameResult[] = [];
    const errors: string[] = [];

    for (const frame of rotation.frames) {
      try {
        frameResults.push(
          await this.runMaskingForFrame(manifest, rotationId, frame)
        );
      } catch (error: unknown) {
        errors.push(
          error instanceof Error
            ? error.message
            : `Masking failed for ${rotationId} frame ${frame.index}.`
        );
      }
    }

    return {
      rotationId,
      status: errors.length > 0 ? "failed" : "complete",
      totalFrames: rotation.frames.length,
      successfulFrames: frameResults.length,
      failedFrames: Math.max(0, rotation.frames.length - frameResults.length),
      artifacts: frameResults.map((result) => result.artifact),
      warnings: [],
      errors
    };
  }

  async runMaskingForFrame(
    manifest: ForgeScanProjectManifest,
    rotationId: RotationId,
    frame: CapturedFrame
  ): Promise<MaskingFrameResult> {
    const artifact: MaskArtifact = {
      rotationId,
      frameIndex: frame.index,
      sourceFrameUri: frame.uri,
      rawMaskPath: createRawMaskPath(rotationId, frame.index),
      refinedMaskPath: createRefinedMaskPath(rotationId, frame.index),
      status: "processing",
      engine: this.mode,
      warnings: [
        "Fallback mask artifact. Native AI masking requires a development/native build."
      ],
      errors: []
    };

    try {
      const rawMaskUri = writeProjectFile(
        manifest,
        artifact.rawMaskPath,
        fallbackMaskPng
      );
      const refinedMaskUri = writeProjectFile(
        manifest,
        artifact.refinedMaskPath,
        fallbackMaskPng
      );
      const completedArtifact: MaskArtifact = {
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
        artifact: completedArtifact
      };
    } catch {
      const fallbackArtifact: MaskArtifact = {
        ...artifact,
        rawMaskPath: createRawMaskFallbackPath(rotationId, frame.index),
        refinedMaskPath: createRefinedMaskFallbackPath(rotationId, frame.index),
        status: "complete",
        createdAt: new Date().toISOString(),
        warnings: [
          ...artifact.warnings,
          "PNG mask writing failed; JSON fallback mask artifacts were created."
        ]
      };
      const rawMaskUri = writeProjectFile(
        manifest,
        fallbackArtifact.rawMaskPath,
        JSON.stringify(fallbackArtifact, null, 2)
      );
      const refinedMaskUri = writeProjectFile(
        manifest,
        fallbackArtifact.refinedMaskPath,
        JSON.stringify(fallbackArtifact, null, 2)
      );

      return {
        frame,
        artifact: {
          ...fallbackArtifact,
          rawMaskUri,
          refinedMaskUri
        }
      };
    }
  }
}

export function createRawMaskPath(rotationId: RotationId, frameIndex: number): string {
  return `advanced/masks/raw/${rotationId}/frame_${String(frameIndex).padStart(3, "0")}.png`;
}

export function createRefinedMaskPath(
  rotationId: RotationId,
  frameIndex: number
): string {
  return `advanced/masks/refined/${rotationId}/frame_${String(frameIndex).padStart(3, "0")}.png`;
}

function createRawMaskFallbackPath(
  rotationId: RotationId,
  frameIndex: number
): string {
  return `advanced/masks/raw/${rotationId}/frame_${String(frameIndex).padStart(3, "0")}.mask.json`;
}

function createRefinedMaskFallbackPath(
  rotationId: RotationId,
  frameIndex: number
): string {
  return `advanced/masks/refined/${rotationId}/frame_${String(frameIndex).padStart(3, "0")}.mask.json`;
}
