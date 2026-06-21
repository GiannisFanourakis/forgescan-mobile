import { ForgeScanProjectManifest } from "../core/manifest";
import {
  MaskArtifact,
  MaskCoverageValidation,
  MaskingStatus,
  MaskingSummary
} from "./MaskingTypes";

export function validateMaskCoverage(
  manifest: ForgeScanProjectManifest,
  masks: MaskArtifact[]
): MaskCoverageValidation {
  const requiredFrames = manifest.capture.rotations
    .filter((rotation) => rotation.required)
    .reduce((sum, rotation) => sum + rotation.frames.length, 0);
  const completeMasks = masks.filter((mask) => mask.status === "complete");
  const errors: string[] = [];
  const warnings: string[] = [];

  if (requiredFrames === 0) {
    errors.push("Required capture rotations do not contain frames.");
  }

  if (completeMasks.length < requiredFrames) {
    warnings.push(
      `${completeMasks.length}/${requiredFrames} required frames have mask artifacts.`
    );
  }

  return {
    status: getMaskingStatusFromCounts(requiredFrames, completeMasks.length),
    requiredFrames,
    maskCount: completeMasks.length,
    complete: requiredFrames > 0 && completeMasks.length >= requiredFrames,
    warnings,
    errors
  };
}

export function getMaskingStatus(
  manifest: ForgeScanProjectManifest,
  masks: MaskArtifact[] = []
): MaskingStatus {
  return validateMaskCoverage(manifest, masks).status;
}

export function createMaskingSummary(
  manifest: ForgeScanProjectManifest,
  masks: MaskArtifact[] = []
): MaskingSummary {
  const coverage = validateMaskCoverage(manifest, masks);
  const engines = [...new Set(masks.map((mask) => mask.engine))];
  const engine =
    engines.length === 1 && engines[0] !== undefined
      ? engines[0]
      : masks.length > 0
        ? "fallback-local"
        : "unavailable";

  return {
    status: coverage.status,
    engine,
    totalFrames: manifest.capture.rotations.reduce(
      (sum, rotation) => sum + rotation.frames.length,
      0
    ),
    maskCount: coverage.maskCount,
    requiredFrames: coverage.requiredFrames,
    userMessage:
      engine === "fallback-local"
        ? "Basic object preparation used."
        : engine === "native-ai"
          ? "Object preparation complete."
          : "Native AI masking requires a development/native build.",
    warnings: coverage.warnings,
    errors: coverage.errors
  };
}

function getMaskingStatusFromCounts(
  requiredFrames: number,
  maskCount: number
): MaskingStatus {
  if (requiredFrames === 0) {
    return "not-started";
  }

  if (maskCount >= requiredFrames) {
    return "complete";
  }

  return "processing";
}
