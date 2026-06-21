import { NativeModules } from "react-native";

import {
  NativeKsplatOptimizerAvailability,
  NativeKsplatOptimizerInput,
  NativeKsplatOptimizerOutput,
  NativeKsplatOptimizerProgress
} from "./NativeKsplatOptimizerTypes";

const nativeOptimizerModule = NativeModules.ForgeScanKsplatOptimizer as
  | {
      getAvailability?: () => Promise<string>;
      runKsplatOptimizer?: (inputJson: string) => Promise<string>;
      cancelKsplatOptimizer?: () => Promise<void>;
    }
  | undefined;

export async function getNativeKsplatOptimizerAvailability(): Promise<NativeKsplatOptimizerAvailability> {
  if (!nativeOptimizerModule?.runKsplatOptimizer) {
    return {
      available: false,
      mode: "requires-native-build",
      moduleName: "ForgeScanKsplatOptimizer",
      reason: "Native .ksplat optimizer requires a development/native build."
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
        optimizerName: "native-ksplat"
      };
    }
  }

  return {
    available: true,
    mode: "native-on-device",
    moduleName: "ForgeScanKsplatOptimizer",
    optimizerName: "native-ksplat"
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
