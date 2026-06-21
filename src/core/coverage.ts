import { CaptureRotation, ForgeScanProjectManifest } from "./manifest";

export type CoverageTier =
  | "empty"
  | "low"
  | "basic"
  | "standard"
  | "high"
  | "very-high";

export const RECOMMENDED_MINIMUM_FRAMES = 24;
export const RECOMMENDED_HIGH_QUALITY_FRAMES = 120;

export interface RotationCoverageSummary {
  rotationId: CaptureRotation["id"];
  label: string;
  actualFrameCount: number;
  recommendedMinimumFrames: number;
  recommendedHighQualityFrames: number;
  coverageTier: CoverageTier;
  coverageLabel: string;
  warning: string | null;
}

export interface ProjectCoverageSummary {
  totalFrames: number;
  rotations: RotationCoverageSummary[];
}

export function getRotationFrameCount(rotation: CaptureRotation): number {
  return rotation.frames.length;
}

export function getRotationCoverageTier(
  rotation: CaptureRotation
): CoverageTier {
  return getCoverageTier(getRotationFrameCount(rotation));
}

export function getProjectCoverageSummary(
  manifest: ForgeScanProjectManifest
): ProjectCoverageSummary {
  const rotations = manifest.capture.rotations.map((rotation) => {
    const actualFrameCount = getRotationFrameCount(rotation);
    return {
      rotationId: rotation.id,
      label: rotation.label,
      actualFrameCount,
      recommendedMinimumFrames: RECOMMENDED_MINIMUM_FRAMES,
      recommendedHighQualityFrames: RECOMMENDED_HIGH_QUALITY_FRAMES,
      coverageTier: getCoverageTier(actualFrameCount),
      coverageLabel: getCoverageLabel(actualFrameCount),
      warning: getCoverageWarning(actualFrameCount)
    };
  });

  return {
    totalFrames: rotations.reduce(
      (sum, rotation) => sum + rotation.actualFrameCount,
      0
    ),
    rotations
  };
}

export function getCoverageTier(frameCount: number): CoverageTier {
  if (frameCount === 0) {
    return "empty";
  }

  if (frameCount < 24) {
    return "low";
  }

  if (frameCount < 72) {
    return "basic";
  }

  if (frameCount < 120) {
    return "standard";
  }

  if (frameCount < 180) {
    return "high";
  }

  return "very-high";
}

export function getCoverageLabel(frameCount: number): string {
  switch (getCoverageTier(frameCount)) {
    case "empty":
      return "Empty";
    case "low":
      return "Low coverage";
    case "basic":
      return "Basic coverage";
    case "standard":
      return "Standard coverage";
    case "high":
      return "High coverage";
    case "very-high":
      return "Very high coverage";
  }
}

export function getCoverageWarning(frameCount: number): string | null {
  if (frameCount === 0) {
    return "No frames captured yet.";
  }

  if (frameCount < RECOMMENDED_MINIMUM_FRAMES) {
    return "Low coverage. Continue capturing for a stronger reconstruction test.";
  }

  return null;
}
