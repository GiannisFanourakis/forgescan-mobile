import { ForgeScanProjectManifest } from "../core/manifest";
import {
  MaskArtifact,
  MaskCoverageValidation,
  MaskingStatus
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
