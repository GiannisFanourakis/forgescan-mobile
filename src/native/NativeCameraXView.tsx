import type { ComponentType } from "react";
import {
  Platform,
  UIManager,
  requireNativeComponent
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

export const NATIVE_CAMERA_X_VIEW_NAME = "ForgeScanCameraXView";

export interface NativeCameraXViewProps {
  style?: StyleProp<ViewStyle>;
  zoom?: number;
  videoQuality?: "2160p" | "1080p" | "720p";
}

export function isNativeCameraXViewAvailable(): boolean {
  return (
    Platform.OS === "android" &&
    typeof UIManager.getViewManagerConfig === "function" &&
    Boolean(UIManager.getViewManagerConfig(NATIVE_CAMERA_X_VIEW_NAME))
  );
}

export const NativeCameraXView: ComponentType<NativeCameraXViewProps> | null =
  isNativeCameraXViewAvailable()
    ? requireNativeComponent<NativeCameraXViewProps>(NATIVE_CAMERA_X_VIEW_NAME)
    : null;
