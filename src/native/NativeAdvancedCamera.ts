import { NativeModules } from "react-native";

import { NativeAdvancedCameraAvailability } from "./NativeAdvancedCameraTypes";

const nativeAdvancedCameraModule = NativeModules.ForgeScanAdvancedCamera as
  | {
      getAvailability?: () => Promise<string>;
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
