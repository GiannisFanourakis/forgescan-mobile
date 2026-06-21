import {
  CapturedFrame,
  ForgeScanProjectManifest,
  RotationId
} from "../core/manifest";
import {
  getNativeMaskingAvailability,
  runNativeMasking
} from "../native/NativeMasking";
import { writeProjectFile } from "../storage/projectStorage";
import { createNativeMaskingInput } from "./NativeMaskingInput";
import {
  MaskArtifact,
  MaskingEngine,
  MaskingFrameResult,
  MaskingProjectResult,
  MaskingRotationResult
} from "./MaskingTypes";

export class NativeMaskingEngine implements MaskingEngine {
  mode = "native-ai" as const;

  async runMaskingForProject(
    manifest: ForgeScanProjectManifest
  ): Promise<MaskingProjectResult> {
    const availability = await getNativeMaskingAvailability();
    const input = createNativeMaskingInput(manifest);

    if (!availability.available) {
      return {
        projectId: manifest.project.id,
        status: "requires-native-build",
        engine: "unavailable",
        engineName: "unavailable",
        createdAt: new Date().toISOString(),
        totalFrames: input.frames.length,
        successfulFrames: 0,
        failedFrames: 0,
        artifacts: [],
        rotationResults: [],
        warnings: [
          availability.reason ??
            "Native AI masking requires a development/native build."
        ],
        errors: []
      };
    }

    const output = await runNativeMasking(input);
    const artifacts: MaskArtifact[] = output.maskArtifacts.map((artifact) => ({
      rotationId: artifact.rotationId,
      frameIndex: artifact.frameIndex,
      sourceFrameUri: artifact.sourceFrameUri,
      ...(artifact.rawMaskUri ? { rawMaskUri: artifact.rawMaskUri } : {}),
      ...(artifact.refinedMaskUri
        ? { refinedMaskUri: artifact.refinedMaskUri }
        : {}),
      rawMaskPath: artifact.rawMaskPath,
      refinedMaskPath: artifact.refinedMaskPath,
      status: artifact.status,
      engine: this.mode,
      createdAt: new Date().toISOString(),
      warnings: artifact.warnings,
      errors: artifact.errors
    }));
    const result: MaskingProjectResult = {
      projectId: manifest.project.id,
      status: output.status,
      engine: this.mode,
      engineName: output.engineName,
      ...(output.engineVersion ? { engineVersion: output.engineVersion } : {}),
      modelName: output.modelName,
      createdAt: new Date().toISOString(),
      totalFrames: input.frames.length,
      successfulFrames: artifacts.filter(
        (artifact) => artifact.status === "complete"
      ).length,
      failedFrames: artifacts.filter((artifact) => artifact.status === "failed")
        .length,
      artifacts,
      rotationResults: [],
      warnings: output.warnings,
      errors: output.errors
    };

    writeProjectFile(
      manifest,
      "advanced/masks/native-masking-result.json",
      JSON.stringify(result, null, 2)
    );

    return result;
  }

  async runMaskingForRotation(
    manifest: ForgeScanProjectManifest,
    rotationId: RotationId
  ): Promise<MaskingRotationResult> {
    const result = await this.runMaskingForProject(manifest);
    const artifacts = result.artifacts.filter(
      (artifact) => artifact.rotationId === rotationId
    );

    return {
      rotationId,
      status: result.status,
      totalFrames: artifacts.length,
      successfulFrames: artifacts.filter(
        (artifact) => artifact.status === "complete"
      ).length,
      failedFrames: artifacts.filter((artifact) => artifact.status === "failed")
        .length,
      artifacts,
      warnings: result.warnings,
      errors: result.errors
    };
  }

  async runMaskingForFrame(
    manifest: ForgeScanProjectManifest,
    rotationId: RotationId,
    frame: CapturedFrame
  ): Promise<MaskingFrameResult> {
    const rotationResult = await this.runMaskingForRotation(manifest, rotationId);
    const artifact = rotationResult.artifacts.find(
      (candidate) => candidate.frameIndex === frame.index
    );

    if (!artifact) {
      throw new Error(`Native mask for ${rotationId} frame ${frame.index} was not returned.`);
    }

    return {
      frame,
      artifact
    };
  }
}
