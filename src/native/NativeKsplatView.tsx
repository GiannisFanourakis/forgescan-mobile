import type { ComponentType } from "react";
import { Platform, requireNativeComponent } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

export const NATIVE_KSPLAT_VIEW_NAME = "ForgeScanKsplatView";

export interface NativeKsplatViewProps {
  autoRotate?: boolean;
  collapsable?: boolean;
  ksplatUri?: string;
  renderScale?: number;
  style?: StyleProp<ViewStyle>;
}

let nativeKsplatView: ComponentType<NativeKsplatViewProps> | null = null;

if (Platform.OS === "android") {
  try {
    nativeKsplatView =
      requireNativeComponent<NativeKsplatViewProps>(NATIVE_KSPLAT_VIEW_NAME);
  } catch {
    nativeKsplatView = null;
  }
}

export function isNativeKsplatViewAvailable(): boolean {
  return nativeKsplatView !== null;
}

export const NativeKsplatView: ComponentType<NativeKsplatViewProps> | null =
  nativeKsplatView;
