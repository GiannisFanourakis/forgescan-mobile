import { NativeModules } from "react-native";

import {
  NativeARCaptureAvailability,
  NativeARCaptureInput,
  NativeARCaptureSmokeResult
} from "./NativeARCaptureTypes";

const nativeARCaptureModule = NativeModules.ForgeScanARCapture as
  | {
      getAvailability?: () => Promise<string>;
      runKeyframeCaptureSmokeTest?: (inputJson: string) => Promise<string>;
    }
  | undefined;

export async function getNativeARCaptureAvailability(): Promise<NativeARCaptureAvailability> {
  if (!nativeARCaptureModule?.getAvailability) {
    return {
      available: false,
      moduleName: "ForgeScanARCapture",
      arCoreRuntimePresent: false,
      arCoreAvailable: false,
      trackingState: "requires-native-build",
      keyframeCaptureImplemented: false,
      fallbackTurntablePoseUsed: true,
      cameraIntrinsicsCaptured: false,
      cameraExtrinsicsCaptured: false,
      keyframeCount: 0,
      warnings: ["ARCore capture diagnostics require an Android development/native build."],
      errors: []
    };
  }

  try {
    return JSON.parse(
      await nativeARCaptureModule.getAvailability()
    ) as NativeARCaptureAvailability;
  } catch (error) {
    return {
      available: false,
      moduleName: "ForgeScanARCapture",
      arCoreRuntimePresent: false,
      arCoreAvailable: false,
      trackingState: "failed",
      keyframeCaptureImplemented: false,
      fallbackTurntablePoseUsed: true,
      cameraIntrinsicsCaptured: false,
      cameraExtrinsicsCaptured: false,
      keyframeCount: 0,
      warnings: ["ARCore availability check failed."],
      errors: [error instanceof Error ? error.message : "Unable to parse ARCore availability."]
    };
  }
}

export async function runNativeARCoreKeyframeSmokeTest(
  input: NativeARCaptureInput
): Promise<NativeARCaptureSmokeResult> {
  const availability = await getNativeARCaptureAvailability();

  if (!availability.available || !nativeARCaptureModule?.runKeyframeCaptureSmokeTest) {
    return {
      ...availability,
      status: "requires-native-build",
      warnings: [
        ...availability.warnings,
        "ARCore keyframe capture diagnostics require an Android development/native build."
      ]
    };
  }

  try {
    return JSON.parse(
      await nativeARCaptureModule.runKeyframeCaptureSmokeTest(JSON.stringify(input))
    ) as NativeARCaptureSmokeResult;
  } catch (error) {
    return {
      ...availability,
      status: "failed",
      warnings: [...availability.warnings, "ARCore keyframe smoke test failed."],
      errors: [
        ...availability.errors,
        error instanceof Error ? error.message : "Unable to parse ARCore smoke result."
      ]
    };
  }
}
