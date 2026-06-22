import { NativeModules } from "react-native";

import {
  NativeARCaptureAvailability,
  NativeARCaptureInput,
  NativeARCaptureKeyframeInput,
  NativeARCaptureResult,
  NativeARCaptureSessionInput,
  NativeARCaptureSmokeResult,
  NativeARCaptureTimedInput
} from "./NativeARCaptureTypes";

const nativeARCaptureModule = NativeModules.ForgeScanARCapture as
  | {
      getAvailability?: () => Promise<string>;
      startSession?: (inputJson: string) => Promise<string>;
      captureKeyframe?: (inputJson: string) => Promise<string>;
      startTimedKeyframeCapture?: (inputJson: string) => Promise<string>;
      stopTimedKeyframeCapture?: () => Promise<string>;
      getSessionStatus?: () => Promise<string>;
      endSession?: () => Promise<string>;
      runKeyframeCaptureSmokeTest?: (inputJson: string) => Promise<string>;
    }
  | undefined;

export async function getNativeARCaptureAvailability(): Promise<NativeARCaptureAvailability> {
  if (!nativeARCaptureModule?.getAvailability) {
    return fallbackAvailability("ARCore tracked capture requires an Android development/native build.");
  }

  try {
    return JSON.parse(
      await nativeARCaptureModule.getAvailability()
    ) as NativeARCaptureAvailability;
  } catch (error) {
    return {
      ...fallbackAvailability("ARCore availability check failed."),
      trackingState: "failed",
      errors: [createErrorMessage(error)]
    };
  }
}

export async function startNativeARCaptureSession(
  input: NativeARCaptureSessionInput
): Promise<NativeARCaptureResult> {
  if (!nativeARCaptureModule?.startSession) {
    return {
      ...fallbackAvailability("ARCore SharedCamera session requires an Android development/native build."),
      status: "requires-native-build"
    };
  }

  return parseNativeARJson(
    await nativeARCaptureModule.startSession(JSON.stringify(input))
  );
}

export async function captureNativeARKeyframe(
  input: NativeARCaptureKeyframeInput
): Promise<NativeARCaptureResult> {
  if (!nativeARCaptureModule?.captureKeyframe) {
    return {
      ...fallbackAvailability("ARCore tracked keyframe capture requires an Android development/native build."),
      status: "requires-native-build",
      errors: []
    };
  }

  return parseNativeARJson(
    await nativeARCaptureModule.captureKeyframe(JSON.stringify(input))
  );
}

export async function startNativeARTimedKeyframeCapture(
  input: NativeARCaptureTimedInput
): Promise<NativeARCaptureResult> {
  if (!nativeARCaptureModule?.startTimedKeyframeCapture) {
    return {
      ...fallbackAvailability("Timed ARCore keyframe capture requires an Android development/native build."),
      status: "requires-native-build"
    };
  }

  return parseNativeARJson(
    await nativeARCaptureModule.startTimedKeyframeCapture(JSON.stringify(input))
  );
}

export async function stopNativeARTimedKeyframeCapture(): Promise<NativeARCaptureResult> {
  if (!nativeARCaptureModule?.stopTimedKeyframeCapture) {
    return {
      ...fallbackAvailability("Timed ARCore keyframe capture requires an Android development/native build."),
      status: "requires-native-build"
    };
  }

  return parseNativeARJson(await nativeARCaptureModule.stopTimedKeyframeCapture());
}

export async function getNativeARCaptureSessionStatus(): Promise<NativeARCaptureResult> {
  if (!nativeARCaptureModule?.getSessionStatus) {
    return {
      ...fallbackAvailability("ARCore session diagnostics require an Android development/native build."),
      status: "requires-native-build"
    };
  }

  return parseNativeARJson(await nativeARCaptureModule.getSessionStatus());
}

export async function endNativeARCaptureSession(): Promise<NativeARCaptureResult> {
  if (!nativeARCaptureModule?.endSession) {
    return {
      ...fallbackAvailability("ARCore SharedCamera session requires an Android development/native build."),
      status: "requires-native-build"
    };
  }

  return parseNativeARJson(await nativeARCaptureModule.endSession());
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
    return parseNativeARJson(
      await nativeARCaptureModule.runKeyframeCaptureSmokeTest(JSON.stringify(input))
    );
  } catch (error) {
    return {
      ...availability,
      status: "failed",
      warnings: [...availability.warnings, "ARCore keyframe smoke test failed."],
      errors: [...availability.errors, createErrorMessage(error)]
    };
  }
}

function fallbackAvailability(message: string): NativeARCaptureAvailability {
  return {
    available: false,
    moduleName: "ForgeScanARCapture",
    arCoreRuntimePresent: false,
    arCoreAvailable: false,
    sharedCameraSupported: false,
    camera2Available: false,
    supportedPhysicalCameras: [],
    supportedLensOptions: [],
    canLockExposure: false,
    canLockWhiteBalance: false,
    canLockFocus: false,
    trackingState: "requires-native-build",
    keyframeCaptureImplemented: false,
    fallbackTurntablePoseUsed: false,
    cameraIntrinsicsCaptured: false,
    cameraExtrinsicsCaptured: false,
    keyframeCount: 0,
    warnings: [message],
    errors: []
  };
}

function parseNativeARJson(json: string): NativeARCaptureResult {
  try {
    return JSON.parse(json) as NativeARCaptureResult;
  } catch {
    return {
      ...fallbackAvailability("Native ARCore capture returned invalid JSON."),
      status: "failed",
      errors: ["Unable to parse native ARCore capture result."]
    };
  }
}

function createErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to parse ARCore result.";
}
