import { NativeModules, Platform } from "react-native";

import { NativePickedVideoResult } from "./NativeMediaPickerTypes";

const nativeMediaPickerModule = NativeModules.ForgeScanMediaPicker as
  | {
      pickVideo?: () => Promise<string>;
    }
  | undefined;

export async function pickNativeVideo(): Promise<NativePickedVideoResult> {
  if (Platform.OS !== "android" || !nativeMediaPickerModule?.pickVideo) {
    return {
      status: "requires-native-build",
      errors: ["Loading a clip from device storage requires the Android development/native build."]
    };
  }

  try {
    const resultJson = await nativeMediaPickerModule.pickVideo();
    const result = JSON.parse(resultJson) as Partial<NativePickedVideoResult>;

    if (result.status === "selected" && result.uri) {
      return {
        status: "selected",
        uri: result.uri,
        errors: [],
        ...(result.sourceUri !== undefined ? { sourceUri: result.sourceUri } : {}),
        ...(result.filename !== undefined ? { filename: result.filename } : {}),
        ...(result.mimeType !== undefined ? { mimeType: result.mimeType } : {}),
        ...(result.bytes !== undefined ? { bytes: result.bytes } : {})
      };
    }

    if (result.status === "cancelled") {
      return {
        status: "cancelled",
        errors: []
      };
    }

    return {
      status: "failed",
      errors: ["The selected clip could not be loaded."]
    };
  } catch (error) {
    return {
      status: "failed",
      errors: [error instanceof Error ? error.message : "Video picker failed."]
    };
  }
}
