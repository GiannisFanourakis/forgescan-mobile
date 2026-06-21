import { ForgeScanProjectManifest } from "../core/manifest";
import {
  getNativeKsplatOptimizerAvailability,
  runNativeKsplatOptimizer
} from "../native/NativeKsplatOptimizer";
import { NativeKsplatOptimizerProgress } from "../native/NativeKsplatOptimizerTypes";
import { createPhotorealAsset } from "../reconstruction/splatting/photorealAsset";
import { writeProjectFile } from "../storage/projectStorage";
import { createKsplatOptimizerInput } from "./KsplatOptimizerInput";
import { KsplatOptimizerResult } from "./KsplatOptimizerResult";
import { MaskArtifact } from "../masking/MaskingTypes";
import {
  registerKsplatResult,
  validateKsplatFile
} from "./KsplatValidation";

export async function runNativeKsplatEngine(
  manifest: ForgeScanProjectManifest,
  masks: MaskArtifact[]
): Promise<KsplatOptimizerResult> {
  return runKsplatGeneration(manifest, masks);
}

export async function runKsplatGeneration(
  manifest: ForgeScanProjectManifest,
  masks: MaskArtifact[] = [],
  onProgress?: (progress: NativeKsplatOptimizerProgress) => void
): Promise<KsplatOptimizerResult> {
  const input = createKsplatOptimizerInput(manifest, masks);
  const availability = await getNativeKsplatOptimizerAvailability();

  writeProjectFile(
    manifest,
    "advanced/splatting/ksplat-optimizer-input.json",
    JSON.stringify(input, null, 2)
  );

  if (!availability.available) {
    return registerKsplatResult(manifest, {
      status: "requires-native-build",
      outputFilename: input.outputFilename,
      warnings: [
        availability.reason ??
          "Native .ksplat optimizer requires a development/native build."
      ],
      errors: []
    });
  }

  const result = await runNativeKsplatOptimizer(input, onProgress);
  const validation = validateKsplatFile(result.ksplatUri);

  if (result.status === "generated" && validation.valid) {
    return registerKsplatResult(manifest, result);
  }

  if (result.status === "generated" && !validation.valid) {
    return registerKsplatResult(manifest, {
      ...result,
      status: "failed",
      warnings: [...result.warnings, ...validation.warnings],
      errors: [...result.errors, ...validation.errors]
    });
  }

  return registerKsplatResult(manifest, result);
}

export function createKsplatPlaceholderStatus(
  manifest: ForgeScanProjectManifest
): KsplatOptimizerResult {
  const asset = createPhotorealAsset(manifest, "requires-native-build");

  return {
    status: "requires-native-build",
    outputFilename: asset.filename,
    warnings: ["Native processing is required to generate .ksplat."],
    errors: []
  };
}
