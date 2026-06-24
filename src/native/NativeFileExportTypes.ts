export interface NativeFileExportResult {
  status: "shared" | "cancelled" | "requires-native-build" | "failed";
  errors: string[];
}
