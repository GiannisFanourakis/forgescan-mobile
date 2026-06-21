import { Platform } from "react-native";

import { androidReconstructionEngine } from "./androidEngine";
import { iosReconstructionEngine } from "./iosEngine";
import {
  MobilePlatform,
  PlatformReconstructionEngine
} from "./types";

export const platformReconstructionEngines: PlatformReconstructionEngine[] = [
  androidReconstructionEngine,
  iosReconstructionEngine
];

export function getPlatformEngine(
  platform: MobilePlatform
): PlatformReconstructionEngine {
  return platform === "android"
    ? androidReconstructionEngine
    : iosReconstructionEngine;
}

export function getCurrentPlatformEngine():
  | PlatformReconstructionEngine
  | undefined {
  if (Platform.OS === "android" || Platform.OS === "ios") {
    return getPlatformEngine(Platform.OS);
  }

  return undefined;
}

export function getRuntimePlatformLabel(): string {
  if (Platform.OS === "android") {
    return "Android";
  }

  if (Platform.OS === "ios") {
    return "iOS";
  }

  return `${Platform.OS} preview`;
}
