import { NativeModules } from "react-native";

import {
  NativeMaskingAvailability,
  NativeMaskingInput,
  NativeMaskingOutput,
  NativeMaskingProgress
} from "./NativeMaskingTypes";

const nativeMaskingModule = NativeModules.ForgeScanNativeMasking as
  | {
      getAvailability?: () => Promise<string>;
      runMasking?: (inputJson: string) => Promise<string>;
      cancelMasking?: () => Promise<void>;
    }
  | undefined;

export async function getNativeMaskingAvailability(): Promise<NativeMaskingAvailability> {
  if (!nativeMaskingModule?.runMasking) {
    return {
      available: false,
      mode: "unavailable",
      moduleName: "ForgeScanNativeMasking",
      reason: "Native AI masking requires a development/native build."
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
