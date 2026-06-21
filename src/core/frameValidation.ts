import {
  CaptureRotation,
  ForgeScanProjectManifest,
  QualityCheckState
} from "./manifest";
import {
  CoverageTier,
  RECOMMENDED_MINIMUM_FRAMES,
  getCoverageTier,
  getCoverageWarning
} from "./coverage";

export interface RotationFrameValidation {
  rotationId: CaptureRotation["id"];
  label: string;
  frameCount: number;
  expectedFrameCount: number;
  coverageTier: CoverageTier;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ProjectValidationResult {
  validForReconstruction: boolean;
  checkedAt: string;
  errors: string[];
  warnings: string[];
  rotationResults: RotationFrameValidation[];
  quality: {
    frameContinuity: QualityCheckState;
    expectedFrameCount: QualityCheckState;
    dimensionsConsistent: QualityCheckState;
    requiredRotationsComplete: QualityCheckState;
    optionalCoverage: QualityCheckState;
  };
}

export function validateRotationFrames(
  rotation: CaptureRotation,
  expectedFrameCount: number
): RotationFrameValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sortedFrames = [...rotation.frames].sort((a, b) => a.index - b.index);
  const indexes = sortedFrames.map((frame) => frame.index);
  const uniqueIndexes = new Set(indexes);

  if (rotation.frames.length === 0) {
    errors.push(`${rotation.label} has no captured frames.`);
  }

  if (uniqueIndexes.size !== indexes.length) {
    errors.push(`${rotation.label} has duplicate frame indexes.`);
  }

  const missingIndexes = findMissingIndexes(indexes);
  if (missingIndexes.length > 0) {
    errors.push(
      `${rotation.label} is missing frame indexes ${missingIndexes.join(", ")}.`
    );
  }

  const coverageWarning = getCoverageWarning(rotation.frames.length);
  if (
    rotation.frames.length > 0 &&
    rotation.frames.length < RECOMMENDED_MINIMUM_FRAMES
  ) {
    warnings.push(
      coverageWarning ??
        `${rotation.label} has low coverage with ${rotation.frames.length} frames.`
    );
  }

  if (!hasConsistentKnownDimensions(rotation)) {
    errors.push(`${rotation.label} has inconsistent known image dimensions.`);
  }

  return {
    rotationId: rotation.id,
    label: rotation.label,
    frameCount: rotation.frames.length,
    expectedFrameCount,
    coverageTier: getCoverageTier(rotation.frames.length),
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function validateProjectForReconstruction(
  manifest: ForgeScanProjectManifest
): ProjectValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rotationResults: RotationFrameValidation[] = [];

  for (const rotation of manifest.capture.rotations) {
    if (rotation.required && rotation.status !== "complete") {
      errors.push(`${rotation.label} is required and is not complete.`);
      continue;
    }

    if (!rotation.required && rotation.status !== "complete") {
      warnings.push(`${rotation.label} is optional and has not been captured.`);
      continue;
    }

    const result = validateRotationFrames(
      rotation,
      manifest.capture.targetFrameCount
    );
    rotationResults.push(result);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  const quality = {
    frameContinuity: stateFromNoMatchingErrors(errors, "missing frame indexes"),
    expectedFrameCount: stateFromNoMatchingErrors(errors, "expected frames"),
    dimensionsConsistent: stateFromNoMatchingErrors(
      errors,
      "inconsistent known image dimensions"
    ),
    requiredRotationsComplete: stateFromNoMatchingErrors(
      errors,
      "required and is not complete"
    ),
    optionalCoverage: warnings.some((warning) => warning.includes("optional"))
      ? "warning"
      : "pass"
  } satisfies ProjectValidationResult["quality"];

  return {
    validForReconstruction: errors.length === 0,
    checkedAt: new Date().toISOString(),
    errors,
    warnings,
    rotationResults,
    quality
  };
}

export function applyProjectValidationToManifest(
  manifest: ForgeScanProjectManifest,
  validation = validateProjectForReconstruction(manifest)
): ForgeScanProjectManifest {
  return {
    ...manifest,
    quality: {
      ...manifest.quality,
      ...validation.quality,
      warnings: validation.warnings,
      lastValidatedAt: validation.checkedAt
    }
  };
}

function findMissingIndexes(indexes: number[]): number[] {
  if (indexes.length === 0) {
    return [];
  }

  const sortedIndexes = [...new Set(indexes)].sort((a, b) => a - b);
  const highestIndex = sortedIndexes[sortedIndexes.length - 1] ?? 0;
  const missingIndexes: number[] = [];

  for (let index = 1; index <= highestIndex; index += 1) {
    if (!sortedIndexes.includes(index)) {
      missingIndexes.push(index);
    }
  }

  return missingIndexes;
}

function hasConsistentKnownDimensions(rotation: CaptureRotation): boolean {
  const dimensions = rotation.frames
    .filter((frame) => frame.width !== undefined && frame.height !== undefined)
    .map((frame) => `${frame.width}x${frame.height}`);

  if (dimensions.length < 2) {
    return true;
  }

  return new Set(dimensions).size === 1;
}

function stateFromNoMatchingErrors(
  errors: string[],
  searchText: string
): QualityCheckState {
  return errors.some((error) => error.includes(searchText)) ? "fail" : "pass";
}
