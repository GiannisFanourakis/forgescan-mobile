import { NativeModules, Platform } from "react-native";

import { NativeFileExportResult } from "./NativeFileExportTypes";

const nativeFileExportModule = NativeModules.ForgeScanFileExport as
  | {
      shareFile?: (inputJson: string) => Promise<string>;
    }
  | undefined;

export async function shareNativeFile(input: {
  uri: string;
  filename: string;
  mimeType: string;
  title: string;
}): Promise<NativeFileExportResult> {
  if (Platform.OS !== "android" || !nativeFileExportModule?.shareFile) {
    return {
      status: "requires-native-build",
      errors: ["Export sharing requires the Android development/native build."]
    };
  }

  try {
    const outputJson = await nativeFileExportModule.shareFile(
      JSON.stringify(input)
    );
    const output = JSON.parse(outputJson) as Partial<NativeFileExportResult>;
    return {
      status: output.status ?? "shared",
      errors: output.errors ?? []
    };
  } catch (error) {
    return {
      status: "failed",
      errors: [error instanceof Error ? error.message : "Unable to export file."]
    };
  }
}
