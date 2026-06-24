export type NativePickedVideoStatus =
  | "selected"
  | "cancelled"
  | "requires-native-build"
  | "failed";

export interface NativePickedVideoResult {
  status: NativePickedVideoStatus;
  uri?: string;
  sourceUri?: string;
  filename?: string;
  mimeType?: string | null;
  bytes?: number;
  errors: string[];
}
