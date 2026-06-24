import { ForgeScanProjectManifest } from "../core/manifest";
import {
  NativeMaskingFrameInput,
  NativeMaskingInput
} from "../native/NativeMaskingTypes";

const DEFAULT_VIDEO_SAMPLE_COUNT = 36;

export function createNativeMaskingInput(
  manifest: ForgeScanProjectManifest
): NativeMaskingInput {
  const frames = manifest.capture.rotations.flatMap((rotation) => {
    const photoFrames: NativeMaskingFrameInput[] = rotation.frames.map((frame) => ({
      rotationId: rotation.id,
      frameIndex: frame.index,
      frameUri: frame.uri
    }));
    const nextFrameIndex = photoFrames.length + 1;
    const videoFrames: NativeMaskingFrameInput[] = (rotation.videos ?? []).flatMap(
      (video, videoIndex) =>
        Array.from({ length: DEFAULT_VIDEO_SAMPLE_COUNT }, (_, sampleIndex) => ({
          rotationId: rotation.id,
          frameIndex:
            nextFrameIndex +
            videoIndex * DEFAULT_VIDEO_SAMPLE_COUNT +
            sampleIndex,
          videoUri: video.uri,
          videoSampleIndex: sampleIndex,
          videoSampleCount: DEFAULT_VIDEO_SAMPLE_COUNT
        }))
    );

    return [...photoFrames, ...videoFrames];
  });

  return {
    projectId: manifest.project.id,
    frames,
    rotationMetadata: manifest.capture.rotations.map((rotation) => ({
      rotationId: rotation.id,
      label: rotation.label,
      required: rotation.required,
      frameCount:
        rotation.frames.length +
        (rotation.videos?.length ?? 0) * DEFAULT_VIDEO_SAMPLE_COUNT,
      status: rotation.status
    })),
    outputDirectory: "advanced/masks",
    modelHint: "mlkit-subject-segmentation",
    desiredMaskFormat: "png",
    refinementEnabled: true,
    modelPreference: "auto-mobile",
    maskInputSize: 256
  };
}
