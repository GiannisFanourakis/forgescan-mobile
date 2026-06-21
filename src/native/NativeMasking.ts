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
      runOneFrameMaskTest?: () => Promise<string>;
      runOneFrameBiRefNetMaskTest?: () => Promise<string>;
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
      maskingEngineStatus: "birefnet-model-missing",
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
        available: true,
        mode: "native-ai",
        moduleName: "ForgeScanNativeMasking",
      engineName: "native-ai"
      };
    }
  }

  return {
    available: true,
    mode: "native-ai",
    moduleName: "ForgeScanNativeMasking",
    engineName: "native-ai"
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
      maskingEngineStatus: "birefnet-model-missing",
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

  const outputJson = await nativeMaskingModule.runMasking(
    JSON.stringify(input)
  );
  const output = JSON.parse(outputJson) as NativeMaskingOutput;

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
      maskingEngineStatus: "birefnet-model-missing",
      fallbackUsed: true,
      warnings: [
        availability.reason ??
          "Native AI masking requires a development/native build."
      ],
      errors: []
    };
  }

  return JSON.parse(
    await nativeMaskingModule.runOneFrameMaskTest()
  ) as NativeMaskingSmokeTestResult;
}

export async function runNativeBiRefNetMaskingSmokeTest(): Promise<NativeMaskingSmokeTestResult> {
  const availability = await getNativeMaskingAvailability();

  if (!availability.available || !nativeMaskingModule?.runOneFrameBiRefNetMaskTest) {
    return {
      status: "requires-native-build",
      modelExists: false,
      modelStatus: "missing",
      modelName: "birefnet.onnx",
      modelAssetPath: "models/masking/birefnet.onnx",
      maskingEngineStatus: "birefnet-model-missing",
      birefnetLoaded: false,
      birefnetInferencePassed: false,
      inferenceBackend: "onnxruntime",
      fallbackUsed: false,
      warnings: [
        availability.reason ??
          "Native AI masking requires a development/native build."
      ],
      errors: []
    };
  }

  return JSON.parse(
    await nativeMaskingModule.runOneFrameBiRefNetMaskTest()
  ) as NativeMaskingSmokeTestResult;
}
