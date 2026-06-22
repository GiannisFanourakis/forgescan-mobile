import type { ComponentType } from "react";
import {
  Platform,
  requireNativeComponent
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

export const NATIVE_CAMERA_X_VIEW_NAME = "ForgeScanCameraXView";

export interface NativeCameraXViewProps {
  style?: StyleProp<ViewStyle>;
  zoom?: number;
  videoQuality?: "2160p" | "1080p" | "720p";
  manualControlsEnabled?: boolean;
  manualIso?: number;
  manualShutterNs?: number;
  manualFocusDistance?: number;
}

let nativeCameraXView: ComponentType<NativeCameraXViewProps> | null = null;

if (Platform.OS === "android") {
  try {
    nativeCameraXView =
      requireNativeComponent<NativeCameraXViewProps>(NATIVE_CAMERA_X_VIEW_NAME);
  } catch {
    nativeCameraXView = null;
  }
}

export function isNativeCameraXViewAvailable(): boolean {
  return nativeCameraXView !== null;
}

export const NativeCameraXView: ComponentType<NativeCameraXViewProps> | null =
  nativeCameraXView;
