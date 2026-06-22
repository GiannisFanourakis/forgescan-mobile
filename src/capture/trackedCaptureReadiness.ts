import {
  CapturedFrame,
  ForgeScanProjectManifest,
  PoseSynchronization,
  RotationId
} from "../core/manifest";

export type TrackedCaptureStatus =
  | "ready"
  | "associated-not-synchronized"
  | "fallback-turntable"
  | "insufficient-tracking"
  | "missing";

export interface TrackedFrameStats {
  totalFrames: number;
  trackedFrames: number;
  framesWithIntrinsics: number;
  framesWithExtrinsics: number;
  framesWith16ValuePoseMatrix: number;
  framesWithTrackingState: number;
  framesWithCameraPhotoAssociatedPose: number;
  framesWithSharedCameraSynchronizedPose: number;
  framesWithMissingPose: number;
  framesUsingTurntableAssumptions: number;
  usableForSplat: number;
}

export interface RotationPoseCompleteness extends TrackedFrameStats {
  rotationId: RotationId;
  label: string;
  required: boolean;
  status: TrackedCaptureStatus;
  recommendedUsableFrames: number;
  warnings: string[];
}

export interface TrackedCaptureReadiness {
  status: TrackedCaptureStatus;
  frameStats: TrackedFrameStats;
  perRotation: RotationPoseCompleteness[];
  warnings: string[];
}

export interface FramePoseReadiness {
  poseSynchronization: PoseSynchronization;
  hasIntrinsics: boolean;
  hasExtrinsics: boolean;
  hasValidPoseMatrix: boolean;
  trackingState: string;
  usableForSplat: boolean;
  unusableReason?: string;
}

export function validateTrackedCaptureForSplat(
  manifest: ForgeScanProjectManifest
): TrackedCaptureReadiness {
  const frameStats = getTrackedFrameStats(manifest);
  const perRotation = manifest.capture.rotations.map((rotation) =>
    getPoseCompletenessForRotation(manifest, rotation.id)
  );
  const requiredRotations = perRotation.filter((rotation) => rotation.required);
  const warnings = getTrackedCaptureWarnings(manifest);

  let status: TrackedCaptureStatus = "ready";
  if (requiredRotations.some((rotation) => rotation.totalFrames === 0)) {
    status = "missing";
  } else if (frameStats.usableForSplat === 0 && frameStats.framesUsingTurntableAssumptions > 0) {
    status = "fallback-turntable";
  } else if (frameStats.usableForSplat === 0) {
    status = "missing";
  } else if (
    requiredRotations.some(
      (rotation) => rotation.usableForSplat < rotation.recommendedUsableFrames
    )
  ) {
    status = "insufficient-tracking";
  } else if (frameStats.framesWithCameraPhotoAssociatedPose > 0) {
    status = "associated-not-synchronized";
  } else if (frameStats.framesWithSharedCameraSynchronizedPose === 0) {
    status = "missing";
  }

  return {
    status,
    frameStats,
    perRotation,
    warnings
  };
}

export function getTrackedFrameStats(
  manifest: ForgeScanProjectManifest
): TrackedFrameStats {
  return manifest.capture.rotations.reduce<TrackedFrameStats>(
    (stats, rotation) => {
      for (const frame of rotation.frames) {
        const readiness = getFramePoseReadiness(frame);
        stats.totalFrames += 1;
        stats.trackedFrames += frame.captureSource === "arcore-shared-camera" ? 1 : 0;
        stats.framesWithIntrinsics += readiness.hasIntrinsics ? 1 : 0;
        stats.framesWithExtrinsics += readiness.hasExtrinsics ? 1 : 0;
        stats.framesWith16ValuePoseMatrix += readiness.hasValidPoseMatrix ? 1 : 0;
        stats.framesWithTrackingState += readiness.trackingState === "TRACKING" ? 1 : 0;
        stats.framesWithCameraPhotoAssociatedPose +=
          readiness.poseSynchronization === "camera-photo-associated" ? 1 : 0;
        stats.framesWithSharedCameraSynchronizedPose +=
          readiness.poseSynchronization === "shared-camera-synchronized" ? 1 : 0;
        stats.framesWithMissingPose +=
          readiness.poseSynchronization === "missing" ? 1 : 0;
        stats.framesUsingTurntableAssumptions +=
          readiness.poseSynchronization === "turntable-assumed" ? 1 : 0;
        stats.usableForSplat += readiness.usableForSplat ? 1 : 0;
      }
      return stats;
    },
    createEmptyStats()
  );
}

export function getTrackedCaptureWarnings(
  manifest: ForgeScanProjectManifest
): string[] {
  const stats = getTrackedFrameStats(manifest);
  const warnings: string[] = [];

  if (stats.framesWithCameraPhotoAssociatedPose > 0) {
    warnings.push(
      "Current build pairs CameraX frames with ARCore poses. This is usable for testing but not final SharedCamera synchronization."
    );
  }

  if (stats.framesUsingTurntableAssumptions > 0 || stats.usableForSplat === 0) {
    warnings.push(
      "Camera pose metadata missing. Optimizer will use turntable assumptions."
    );
  }

  for (const rotation of manifest.capture.rotations.filter((candidate) => candidate.required)) {
    const completeness = getPoseCompletenessForRotation(manifest, rotation.id);
    if (completeness.totalFrames === 0) {
      warnings.push(`${rotation.label}: capture tracked frames before running splat optimization.`);
    } else if (completeness.usableForSplat < completeness.recommendedUsableFrames) {
      warnings.push(`${rotation.label}: capture more tracked frames before running splat optimization.`);
    }
  }

  return [...new Set(warnings)];
}

export function getPoseCompletenessForRotation(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId
): RotationPoseCompleteness {
  const rotation = manifest.capture.rotations.find(
    (candidate) => candidate.id === rotationId
  );
  const stats = createEmptyStats();

  if (!rotation) {
    return {
      ...stats,
      rotationId,
      label: rotationId,
      required: false,
      status: "missing",
      recommendedUsableFrames: getRecommendedUsableFrames(manifest),
      warnings: ["Rotation not found."]
    };
  }

  for (const frame of rotation.frames) {
    const readiness = getFramePoseReadiness(frame);
    stats.totalFrames += 1;
    stats.trackedFrames += frame.captureSource === "arcore-shared-camera" ? 1 : 0;
    stats.framesWithIntrinsics += readiness.hasIntrinsics ? 1 : 0;
    stats.framesWithExtrinsics += readiness.hasExtrinsics ? 1 : 0;
    stats.framesWith16ValuePoseMatrix += readiness.hasValidPoseMatrix ? 1 : 0;
    stats.framesWithTrackingState += readiness.trackingState === "TRACKING" ? 1 : 0;
    stats.framesWithCameraPhotoAssociatedPose +=
      readiness.poseSynchronization === "camera-photo-associated" ? 1 : 0;
    stats.framesWithSharedCameraSynchronizedPose +=
      readiness.poseSynchronization === "shared-camera-synchronized" ? 1 : 0;
    stats.framesWithMissingPose += readiness.poseSynchronization === "missing" ? 1 : 0;
    stats.framesUsingTurntableAssumptions +=
      readiness.poseSynchronization === "turntable-assumed" ? 1 : 0;
    stats.usableForSplat += readiness.usableForSplat ? 1 : 0;
  }

  const recommendedUsableFrames = getRecommendedUsableFrames(manifest);
  const warnings: string[] = [];
  let status: TrackedCaptureStatus = "ready";

  if (stats.totalFrames === 0) {
    status = "missing";
    warnings.push("No frames captured.");
  } else if (stats.usableForSplat === 0 && stats.framesUsingTurntableAssumptions > 0) {
    status = "fallback-turntable";
    warnings.push("No real pose metadata. Turntable assumptions will be used.");
  } else if (stats.usableForSplat === 0) {
    status = "missing";
    warnings.push("No usable tracked frames.");
  } else if (stats.usableForSplat < recommendedUsableFrames) {
    status = "insufficient-tracking";
    warnings.push("Capture more tracked frames before final splat optimization.");
  } else if (stats.framesWithCameraPhotoAssociatedPose > 0) {
    status = "associated-not-synchronized";
    warnings.push("CameraX frames are associated with ARCore poses, not fully synchronized.");
  }

  return {
    ...stats,
    rotationId,
    label: rotation.label,
    required: rotation.required,
    status,
    recommendedUsableFrames,
    warnings
  };
}

export function getFramePoseReadiness(frame: CapturedFrame): FramePoseReadiness {
  const poseSynchronization = inferPoseSynchronization(frame);
  const hasIntrinsics = frame.cameraIntrinsics !== undefined;
  const hasExtrinsics = frame.cameraExtrinsics !== undefined;
  const hasValidPoseMatrix = frame.cameraExtrinsics?.transform?.length === 16;
  const trackingState = frame.trackingState ?? "unknown";
  const usableForSplat =
    hasIntrinsics &&
    hasExtrinsics &&
    hasValidPoseMatrix &&
    trackingState === "TRACKING" &&
    (poseSynchronization === "camera-photo-associated" ||
      poseSynchronization === "shared-camera-synchronized");
  const unusableReason = usableForSplat
    ? undefined
    : createUnusableReason({
        hasIntrinsics,
        hasExtrinsics,
        hasValidPoseMatrix,
        trackingState,
        poseSynchronization
      });

  return {
    poseSynchronization,
    hasIntrinsics,
    hasExtrinsics,
    hasValidPoseMatrix,
    trackingState,
    usableForSplat,
    ...(unusableReason !== undefined ? { unusableReason } : {})
  };
}

function inferPoseSynchronization(frame: CapturedFrame): PoseSynchronization {
  if (frame.poseSynchronization !== undefined) {
    return frame.poseSynchronization;
  }

  if (
    frame.captureSource === "arcore-shared-camera" &&
    frame.cameraIntrinsics !== undefined &&
    frame.cameraExtrinsics?.transform?.length === 16
  ) {
    return "camera-photo-associated";
  }

  if (
    frame.captureSource === "simulated" ||
    frame.captureSource === "camera" ||
    frame.captureSource === "imported"
  ) {
    return "turntable-assumed";
  }

  return "missing";
}

function createUnusableReason(input: {
  hasIntrinsics: boolean;
  hasExtrinsics: boolean;
  hasValidPoseMatrix: boolean;
  trackingState: string;
  poseSynchronization: PoseSynchronization;
}): string {
  if (input.poseSynchronization === "turntable-assumed") {
    return "turntable assumptions";
  }

  if (input.poseSynchronization === "missing") {
    return "pose missing";
  }

  if (!input.hasIntrinsics) {
    return "intrinsics missing";
  }

  if (!input.hasExtrinsics) {
    return "extrinsics missing";
  }

  if (!input.hasValidPoseMatrix) {
    return "pose matrix invalid";
  }

  if (input.trackingState !== "TRACKING") {
    return `tracking ${input.trackingState}`;
  }

  return "unusable";
}

function getRecommendedUsableFrames(manifest: ForgeScanProjectManifest): number {
  return Math.max(
    1,
    Math.min(
      manifest.capture.minKeyframes ?? 40,
      manifest.capture.targetFrameCount
    )
  );
}

function createEmptyStats(): TrackedFrameStats {
  return {
    totalFrames: 0,
    trackedFrames: 0,
    framesWithIntrinsics: 0,
    framesWithExtrinsics: 0,
    framesWith16ValuePoseMatrix: 0,
    framesWithTrackingState: 0,
    framesWithCameraPhotoAssociatedPose: 0,
    framesWithSharedCameraSynchronizedPose: 0,
    framesWithMissingPose: 0,
    framesUsingTurntableAssumptions: 0,
    usableForSplat: 0
  };
}
