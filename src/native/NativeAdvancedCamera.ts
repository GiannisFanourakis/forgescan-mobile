import { NativeModules } from "react-native";

import {
  NativeAdvancedCameraAvailability,
  NativeCameraXCaptureInput,
  NativeCameraXCaptureResult,
  NativeCameraXVideoResult
} from "./NativeAdvancedCameraTypes";

const nativeAdvancedCameraModule = NativeModules.ForgeScanAdvancedCamera as
  | {
      getAvailability?: () => Promise<string>;
      capturePhoto?: (inputJson: string) => Promise<string>;
      startVideoCapture?: (inputJson: string) => Promise<string>;
      stopVideoCapture?: () => Promise<void>;
    }
  | undefined;

export async function getNativeAdvancedCameraAvailability(): Promise<NativeAdvancedCameraAvailability> {
  if (!nativeAdvancedCameraModule?.getAvailability) {
    return {
      available: false,
      moduleName: "ForgeScanAdvancedCamera",
      camera2Available: false,
      cameraXCaptureImplemented: false,
      camera2ManualCaptureImplemented: false,
      arCoreSharedCameraImplemented: false,
      cameras: [],
      warnings: [
        "Advanced Android camera diagnostics require a development/native build."
      ],
      errors: []
    };
  }

  try {
    return JSON.parse(
      await nativeAdvancedCameraModule.getAvailability()
    ) as NativeAdvancedCameraAvailability;
  } catch (error) {
    return {
      available: false,
      moduleName: "ForgeScanAdvancedCamera",
      camera2Available: false,
      cameraXCaptureImplemented: false,
      camera2ManualCaptureImplemented: false,
      arCoreSharedCameraImplemented: false,
      cameras: [],
      warnings: ["Advanced Android camera diagnostics failed."],
      errors: [
        error instanceof Error
          ? error.message
          : "Unable to parse advanced camera diagnostics."
      ]
    };
  }
}

export function isNativeCameraXCaptureAvailable(): boolean {
  return Boolean(
    nativeAdvancedCameraModule?.capturePhoto &&
      nativeAdvancedCameraModule.startVideoCapture &&
      nativeAdvancedCameraModule.stopVideoCapture
  );
}

export async function captureNativeCameraXPhoto(
  input: NativeCameraXCaptureInput
): Promise<NativeCameraXCaptureResult> {
  if (!nativeAdvancedCameraModule?.capturePhoto) {
    throw new Error("Native CameraX photo capture requires an Android development build.");
  }

  return parseNativeCameraJson<NativeCameraXCaptureResult>(
    await nativeAdvancedCameraModule.capturePhoto(JSON.stringify(input))
  );
}

export async function startNativeCameraXVideo(
  input: NativeCameraXCaptureInput
): Promise<NativeCameraXVideoResult> {
  if (!nativeAdvancedCameraModule?.startVideoCapture) {
    throw new Error("Native CameraX video capture requires an Android development build.");
  }

  return parseNativeCameraJson<NativeCameraXVideoResult>(
    await nativeAdvancedCameraModule.startVideoCapture(JSON.stringify(input))
  );
}

export async function stopNativeCameraXVideo(): Promise<void> {
  if (!nativeAdvancedCameraModule?.stopVideoCapture) {
    throw new Error("Native CameraX video capture requires an Android development build.");
  }

  await nativeAdvancedCameraModule.stopVideoCapture();
}

function parseNativeCameraJson<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error("Native CameraX returned an invalid capture result.");
  }
}
