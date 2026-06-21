import { File } from "expo-file-system";

import { ForgeScanProjectManifest } from "../core/manifest";
import {
  createPhotorealAsset,
  getExpectedKsplatPath,
  getPhotorealStatusLabel
} from "../reconstruction/splatting/photorealAsset";
import { writeProjectFile } from "../storage/projectStorage";
import { KsplatOptimizerResult } from "./KsplatOptimizerResult";

export interface KsplatValidationResult {
  valid: boolean;
  status: "Generated" | "Requires native build" | "Failed";
  warnings: string[];
  errors: string[];
}

export function validateKsplatFile(uri?: string): KsplatValidationResult {
  if (!uri) {
    return {
      valid: false,
      status: "Requires native build",
      warnings: ["Native processing is required to generate .ksplat."],
      errors: []
    };
  }

  if (!uri.toLowerCase().endsWith(".ksplat")) {
    return {
      valid: false,
      status: "Failed",
      warnings: [],
      errors: ["Generated file is not a .ksplat."]
    };
  }

  try {
    const file = new File(uri);
    if (!file.exists) {
      return {
        valid: false,
        status: "Failed",
        warnings: [],
        errors: [".ksplat file was reported but does not exist."]
      };
    }

    if (file.size <= 0) {
      return {
        valid: false,
        status: "Failed",
        warnings: [],
        errors: [".ksplat file was reported but is empty."]
      };
    }
  } catch {
    return {
      valid: false,
      status: "Failed",
      warnings: [],
      errors: ["Unable to inspect reported .ksplat file."]
    };
  }

  return {
    valid: true,
    status: "Generated",
    warnings: [],
    errors: []
  };
}

export function registerKsplatResult(
  manifest: ForgeScanProjectManifest,
  result: KsplatOptimizerResult
): KsplatOptimizerResult {
  writeProjectFile(
    manifest,
    "advanced/splatting/ksplat-result.json",
    JSON.stringify(result, null, 2)
  );

  return result;
}

export function getKsplatDisplayStatus(
  manifest: ForgeScanProjectManifest,
  result?: KsplatOptimizerResult
): string {
  if (result?.status === "generated" && result.ksplatUri) {
    return "Generated";
  }

  if (result?.status === "failed") {
    return "Failed";
  }

  return getPhotorealStatusLabel(
    createPhotorealAsset(manifest, "requires-native-build").status
  );
}

export function getExpectedKsplatDisplayPath(
  manifest: ForgeScanProjectManifest
): string {
  return getExpectedKsplatPath(manifest);
}

export function getKsplatExportLabel(
  manifest: ForgeScanProjectManifest
): string {
  return createPhotorealAsset(manifest, "requires-native-build").filename;
}
