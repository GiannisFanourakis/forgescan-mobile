export type ReactNativeArchitectureStatus =
  | "new-architecture-disabled-for-windows-build-stability"
  | "new-architecture-enabled"
  | "unknown";

export function getReactNativeArchitectureStatus(
  newArchEnabled: unknown
): ReactNativeArchitectureStatus {
  if (newArchEnabled === true) {
    return "new-architecture-enabled";
  }

  if (newArchEnabled === false) {
    return "new-architecture-disabled-for-windows-build-stability";
  }

  return "unknown";
}

export function getReactNativeArchitectureReason(
  status: ReactNativeArchitectureStatus
): string {
  if (status === "new-architecture-disabled-for-windows-build-stability") {
    return "Disabled to avoid Windows long-path native C++ build failures.";
  }

  if (status === "new-architecture-enabled") {
    return "New Architecture is enabled.";
  }

  return "React Native architecture status is unknown.";
}
