import { ForgeScanProjectManifest } from "../core/manifest";
import { getSelectedReconstructionModel } from "./modelRegistry";
import {
  PlatformReconstructionEngine,
  PlatformReconstructionJobPlan
} from "./types";

export const androidReconstructionEngine: PlatformReconstructionEngine = {
  platform: "android",
  displayName: "Android local splatting",
  nativeModuleName: "ForgeScanAndroidSplatting",
  implementationStatus: "native-track",
  summary:
    "Android will use the shared capture workflow, then add ARCore, Kotlin/C++ NDK, OpenCV, MediaPipe or LiteRT, and GPU acceleration for local .ksplat optimization.",
  capabilities: [
    {
      id: "capture",
      label: "Structured capture",
      status: "available",
      detail:
        "The shared React Native workflow already supports guided rotations and ordered frame metadata."
    },
    {
      id: "arcore-tracking",
      label: "ARCore tracking",
      status: "requires-native-build",
      detail:
        "Camera pose and motion tracking need a native Android module and ARCore runtime checks."
    },
    {
      id: "depth",
      label: "Depth-assisted alignment",
      status: "planned",
      detail:
        "Use ARCore Depth where available, with capture-only fallback on unsupported devices."
    },
    {
      id: "segmentation",
      label: "On-device object masks",
      status: "planned",
      detail:
        "MediaPipe or LiteRT can provide local object masks before pose and splat optimization."
    },
    {
      id: "splatting",
      label: "Native splat optimization",
      status: "requires-native-build",
      detail:
        "Heavy .ksplat optimization should live in Kotlin/C++ with NDK and GPU acceleration."
    },
    {
      id: "exports",
      label: ".ksplat export",
      status: "planned",
      detail:
        "The normal final output is ForgeScan_{projectName}.ksplat."
    }
  ],
  roadmap: [
    {
      order: 1,
      title: "Add native capability checks",
      detail:
        "Detect ARCore support, Depth support, available memory, thermal state, and GPU path."
    },
    {
      order: 2,
      title: "Persist real capture frames",
      detail:
        "Write rotation images to app storage with manifest paths that the native module can read."
    },
    {
      order: 3,
      title: "Build Android native module",
      detail:
        "Expose Kotlin/C++ calls for masks, poses, alignment, splat optimization, and .ksplat export."
    },
    {
      order: 4,
      title: "Ship device-tiered splatting",
      detail:
        "Run local .ksplat optimization on high-end devices and report requires-native-build on unsupported runtimes."
    }
  ],
  createJobPlan: createAndroidJobPlan
};

function createAndroidJobPlan(
  manifest: ForgeScanProjectManifest
): PlatformReconstructionJobPlan {
  const model = getSelectedReconstructionModel(manifest);

  return {
    platform: "android",
    projectId: manifest.project.id,
    projectTitle: manifest.project.title,
    status: "plan-only",
    nativeModuleName: "ForgeScanAndroidSplatting",
    aiModel: {
      id: model.id,
      label: model.label,
      version: model.version,
      runtime: model.runtime,
      status: model.status
    },
    requiredInputs: [
      "manifest.json",
      "rotations/upright/",
      "rotations/tilted/",
      "rotations/underside/",
      "rotation video clips when present"
    ],
    targetFormats: [...manifest.processing.reconstruction.targetFormats],
    stages: [
      "ARCore capability check",
      `${model.label} model readiness check`,
      "MediaPipe or LiteRT segmentation",
      "OpenCV feature matching",
      "ARCore pose and optional depth fusion",
      "Kotlin/C++ splat optimization",
      ".ksplat export",
      "MP4/GIF preview export"
    ]
  };
}
