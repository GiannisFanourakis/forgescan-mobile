import { NativeModules } from "react-native";

import {
  NativeKsplatOptimizerAvailability,
  NativeKsplatOptimizerInput,
  NativeKsplatOptimizerOutput,
  NativeKsplatOptimizerProgress,
  NativeKsplatSmokeTestResult
} from "./NativeKsplatOptimizerTypes";

const nativeOptimizerModule = NativeModules.ForgeScanKsplatOptimizer as
  | {
      getAvailability?: () => Promise<string>;
      runKsplatOptimizer?: (inputJson: string) => Promise<string>;
      runTinyGaussianTrainingTest?: () => Promise<string>;
      runTinySplatSmokeTest?: () => Promise<string>;
      cancelKsplatOptimizer?: () => Promise<void>;
    }
  | undefined;

export async function getNativeKsplatOptimizerAvailability(): Promise<NativeKsplatOptimizerAvailability> {
  if (!nativeOptimizerModule?.runKsplatOptimizer) {
    return {
      available: false,
      mode: "requires-native-build",
      moduleName: "ForgeScanKsplatOptimizer",
      reason: "Native .ksplat optimizer requires a development/native build.",
      ksplatWriterStatus: "unsupported",
      optimizerRuntimeStatus: "requires-native-build",
      optimizerBlocker: "Native .ksplat optimizer requires a development/native build.",
      trainableLoopAvailable: false,
      coarseFallbackAvailable: false,
      production3dgs: false,
      production3dgsStatus: "production-3dgs-missing"
    };
  }

  if (nativeOptimizerModule.getAvailability) {
    try {
      return JSON.parse(
        await nativeOptimizerModule.getAvailability()
      ) as NativeKsplatOptimizerAvailability;
    } catch {
      return {
        available: true,
        mode: "native-on-device",
        moduleName: "ForgeScanKsplatOptimizer",
        optimizerName: "trainable-3dgs-android-v1",
        qualityTier: "trainable-v1",
        ksplatEngineStatus: "trainable-3dgs-v1-running",
        ksplatWriterStatus: "experimental-ksplat",
        optimizerRuntimeStatus: "trainable-loop-available",
        optimizerBlocker: "none",
        production3dgs: false,
        production3dgsStatus: "production-3dgs-missing",
        trainableLoopAvailable: true,
        coarseFallbackAvailable: true
      };
    }
  }

  return {
    available: true,
    mode: "native-on-device",
    moduleName: "ForgeScanKsplatOptimizer",
    optimizerName: "trainable-3dgs-android-v1",
    qualityTier: "trainable-v1",
    ksplatEngineStatus: "trainable-3dgs-v1-running",
    ksplatWriterStatus: "experimental-ksplat",
    optimizerRuntimeStatus: "trainable-loop-available",
    optimizerBlocker: "none",
    production3dgs: false,
    production3dgsStatus: "production-3dgs-missing",
    trainableLoopAvailable: true,
    coarseFallbackAvailable: true
  };
}

export async function runNativeKsplatOptimizer(
  input: NativeKsplatOptimizerInput,
  onProgress?: (progress: NativeKsplatOptimizerProgress) => void
): Promise<NativeKsplatOptimizerOutput> {
  const availability = await getNativeKsplatOptimizerAvailability();

  if (!availability.available || !nativeOptimizerModule?.runKsplatOptimizer) {
    return {
      status: "requires-native-build",
      outputFilename: input.outputFilename,
      optimizerName: "trainable-3dgs-android-v1",
      qualityTier: "none",
      ksplatEngineStatus: "production-3dgs-missing",
      ksplatWriterStatus: "unsupported",
      optimizerRuntimeStatus: "requires-native-build",
      optimizerBlocker: "Native .ksplat optimizer requires a development/native build.",
      production3dgs: false,
      production3dgsStatus: "production-3dgs-missing",
      warnings: [
        availability.reason ??
          "Native .ksplat optimizer requires a development/native build."
      ],
      errors: []
    };
  }

  onProgress?.({
    status: "preparing",
    progress: 0,
    message: "Native .ksplat optimizer preparing."
  });

  const outputJson = await nativeOptimizerModule.runKsplatOptimizer(
    JSON.stringify(input)
  );
  const output = JSON.parse(outputJson) as NativeKsplatOptimizerOutput;

  onProgress?.({
    status: "processing",
    progress: output.status === "generated" ? 1 : 0,
    message: "Native .ksplat optimizer finished."
  });

  return output;
}

export async function cancelNativeKsplatOptimizer(): Promise<void> {
  await nativeOptimizerModule?.cancelKsplatOptimizer?.();
}

export async function runNativeKsplatSmokeTest(): Promise<NativeKsplatSmokeTestResult> {
  const availability = await getNativeKsplatOptimizerAvailability();

  if (!availability.available || !nativeOptimizerModule?.runTinySplatSmokeTest) {
    return {
      status: "requires-native-build",
      writerAvailable: false,
      qualityTier: "none",
      ksplatEngineStatus: "production-3dgs-missing",
      ksplatWriterStatus: "unsupported",
      optimizerRuntimeStatus: "requires-native-build",
      optimizerBlocker: "Native .ksplat optimizer requires a development/native build.",
      production3dgs: false,
      production3dgsStatus: "production-3dgs-missing",
      warnings: [
        availability.reason ??
          "Native .ksplat optimizer requires a development/native build."
      ],
      errors: []
    };
  }

  return JSON.parse(
    await nativeOptimizerModule.runTinySplatSmokeTest()
  ) as NativeKsplatSmokeTestResult;
}

export async function runNativeGaussianTrainingSmokeTest(): Promise<NativeKsplatSmokeTestResult> {
  const availability = await getNativeKsplatOptimizerAvailability();

  if (!availability.available || !nativeOptimizerModule?.runTinyGaussianTrainingTest) {
    return {
      status: "requires-native-build",
      writerAvailable: false,
      qualityTier: "none",
      ksplatEngineStatus: "production-3dgs-missing",
      ksplatWriterStatus: "unsupported",
      optimizerRuntimeStatus: "requires-native-build",
      optimizerBlocker: "Native .ksplat optimizer requires a development/native build.",
      production3dgs: false,
      production3dgsStatus: "production-3dgs-missing",
      trainableLoopAvailable: false,
      coarseFallbackAvailable: false,
      warnings: [
        availability.reason ??
          "Native .ksplat optimizer requires a development/native build."
      ],
      errors: []
    };
  }

  return JSON.parse(
    await nativeOptimizerModule.runTinyGaussianTrainingTest()
  ) as NativeKsplatSmokeTestResult;
}
