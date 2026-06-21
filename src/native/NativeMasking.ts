import { NativeModules } from "react-native";

import {
  NativeMaskingAvailability,
  NativeMaskingInput,
  NativeMaskingOutput,
  NativeMaskingProgress,
  NativeMaskingSmokeTestResult
} from "./NativeMaskingTypes";

const nativeMaskingModule = NativeModules.ForgeScanNativeMasking as
  | {
      getAvailability?: () => Promise<string>;
      runMasking?: (inputJson: string) => Promise<string>;
      runOneFrameMaskTest?: (inputJson: string) => Promise<string>;
      cancelMasking?: () => Promise<void>;
    }
  | undefined;

export async function getNativeMaskingAvailability(): Promise<NativeMaskingAvailability> {
  if (!nativeMaskingModule?.runMasking) {
    return {
      available: false,
      mode: "unavailable",
      moduleName: "ForgeScanNativeMasking",
      reason: "Native AI masking requires a development/native build.",
      modelStatus: "missing",
      maskingEngineStatus: "fallback-local",
      mlKitAvailable: false,
      defaultMaskingEngine: "mlkit-subject-segmentation",
      fallbackUsed: true
    };
  }

  if (nativeMaskingModule.getAvailability) {
    try {
      return JSON.parse(
        await nativeMaskingModule.getAvailability()
      ) as NativeMaskingAvailability;
    } catch {
      return {
        available: false,
        mode: "unavailable",
        moduleName: "ForgeScanNativeMasking",
        reason: "Native masking availability returned invalid JSON.",
        engineName: "android-masking",
        modelStatus: "load-failed",
        maskingEngineStatus: "failed",
        mlKitAvailable: false,
        fallbackUsed: true
      };
    }
  }

  return {
    available: true,
    mode: "native-ai",
    moduleName: "ForgeScanNativeMasking",
    engineName: "android-masking",
    modelStatus: "not-loaded",
    maskingEngineStatus: "available-not-loaded",
    defaultMaskingEngine: "mlkit-subject-segmentation"
  };
}

export async function runNativeMasking(
  input: NativeMaskingInput,
  onProgress?: (progress: NativeMaskingProgress) => void
): Promise<NativeMaskingOutput> {
  const availability = await getNativeMaskingAvailability();

  if (!availability.available || !nativeMaskingModule?.runMasking) {
    return {
      status: "requires-native-build",
      maskArtifacts: [],
      engineName: "unavailable",
      modelName: input.modelHint,
      modelStatus: "missing",
      maskingEngineStatus: "fallback-local",
      fallbackUsed: true,
      warnings: [
        availability.reason ??
          "Native AI masking requires a development/native build."
      ],
      errors: []
    };
  }

  onProgress?.({
    status: "processing",
    completedFrames: 0,
    totalFrames: input.frames.length,
    message: "Native object masking started."
  });

  let output: NativeMaskingOutput;
  try {
    const outputJson = await nativeMaskingModule.runMasking(
      JSON.stringify(input)
    );
    output = JSON.parse(outputJson) as NativeMaskingOutput;
  } catch (error) {
    return {
      status: "failed",
      maskArtifacts: [],
      engineName: "android-masking",
      modelName: input.modelHint,
      modelStatus: "load-failed",
      maskingEngineStatus: "failed",
      fallbackUsed: true,
      warnings: ["Native masking failed before returning a usable result."],
      errors: [error instanceof Error ? error.message : "Native masking result parse failed."]
    };
  }

  onProgress?.({
    status: "processing",
    completedFrames: output.maskArtifacts.filter(
      (artifact) => artifact.status === "complete"
    ).length,
    totalFrames: input.frames.length,
    message: "Native object masking finished."
  });

  return output;
}

export async function cancelNativeMasking(): Promise<void> {
  await nativeMaskingModule?.cancelMasking?.();
}

export async function runNativeMaskingSmokeTest(): Promise<NativeMaskingSmokeTestResult> {
  const availability = await getNativeMaskingAvailability();

  if (!availability.available || !nativeMaskingModule?.runOneFrameMaskTest) {
    return {
      status: "requires-native-build",
      modelExists: false,
      modelStatus: "missing",
      maskingEngineStatus: "fallback-local",
      mlKitAvailable: false,
      defaultMaskingEngine: "mlkit-subject-segmentation",
      fallbackUsed: true,
      warnings: [
        availability.reason ??
          "Native AI masking requires a development/native build."
      ],
      errors: []
    };
  }

  try {
    return JSON.parse(
      await nativeMaskingModule.runOneFrameMaskTest(
        JSON.stringify({
          modelPreference: "auto-mobile",
          maskInputSize: 192
        })
      )
    ) as NativeMaskingSmokeTestResult;
  } catch (error) {
    return {
      status: "fail",
      modelExists: false,
      modelStatus: "load-failed",
      maskingEngineStatus: "failed",
      fallbackUsed: true,
      warnings: ["One-frame ML Kit mask test failed before returning a usable result."],
      errors: [error instanceof Error ? error.message : "Native mask test result parse failed."]
    };
  }
}
