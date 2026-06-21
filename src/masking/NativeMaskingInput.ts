import { ForgeScanProjectManifest } from "../core/manifest";
import { NativeMaskingInput } from "../native/NativeMaskingTypes";

export function createNativeMaskingInput(
  manifest: ForgeScanProjectManifest
): NativeMaskingInput {
  return {
    projectId: manifest.project.id,
    frames: manifest.capture.rotations.flatMap((rotation) =>
      rotation.frames.map((frame) => ({
        rotationId: rotation.id,
        frameIndex: frame.index,
        frameUri: frame.uri
      }))
    ),
    rotationMetadata: manifest.capture.rotations.map((rotation) => ({
      rotationId: rotation.id,
      label: rotation.label,
      required: rotation.required,
      frameCount: rotation.frames.length,
      status: rotation.status
    })),
    outputDirectory: "advanced/masks",
    modelHint: "birefnet-object-background",
    desiredMaskFormat: "png",
    refinementEnabled: true
  };
}
