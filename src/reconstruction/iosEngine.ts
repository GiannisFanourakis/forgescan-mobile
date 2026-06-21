import { ForgeScanProjectManifest } from "../core/manifest";
import { getSelectedReconstructionModel } from "./modelRegistry";
import {
  PlatformReconstructionEngine,
  PlatformReconstructionJobPlan
} from "./types";

export const iosReconstructionEngine: PlatformReconstructionEngine = {
  platform: "ios",
  displayName: "iOS local splatting",
  nativeModuleName: "ForgeScanIOSSplatting",
  implementationStatus: "native-track",
  summary:
    "iOS will use the shared capture workflow, then add Swift, ARKit/RealityKit, Vision or Core ML, Metal acceleration, and local .ksplat optimization.",
  capabilities: [
    {
      id: "capture",
      label: "Structured capture",
      status: "available",
      detail:
        "The shared React Native workflow already supports guided rotations and ordered frame metadata."
    },
    {
      id: "arkit-tracking",
      label: "ARKit tracking",
      status: "requires-native-build",
      detail:
        "Camera pose and device motion need a native Swift module with runtime checks."
    },
    {
      id: "segmentation",
      label: "On-device object masks",
      status: "planned",
      detail:
        "Vision or Core ML can generate object masks before pose and splat optimization."
    },
    {
      id: "splatting",
      label: "Native splat optimization",
      status: "requires-native-build",
      detail:
        "Local .ksplat optimization should run in Swift/C++ or Metal-backed native code."
    },
    {
      id: "object-capture",
      label: "Apple capture support",
      status: "planned",
      detail:
        "A native iOS track can evaluate ARKit/RealityKit capture data where device support allows it."
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
        "Detect ARKit support, device class, memory pressure, and supported acceleration paths."
    },
    {
      order: 2,
      title: "Persist real capture frames",
      detail:
        "Write rotation images to app storage with manifest paths that the native module can read."
    },
    {
      order: 3,
      title: "Build iOS native module",
      detail:
        "Expose Swift calls for masks, poses, alignment, splat optimization, and .ksplat export."
    },
    {
      order: 4,
      title: "Ship iOS local splatting",
      detail:
        "Generate .ksplat locally on supported devices and report requires-native-build on unsupported runtimes."
    }
  ],
  createJobPlan: createIOSJobPlan
};

function createIOSJobPlan(
  manifest: ForgeScanProjectManifest
): PlatformReconstructionJobPlan {
  const model = getSelectedReconstructionModel(manifest);

  return {
    platform: "ios",
    projectId: manifest.project.id,
    projectTitle: manifest.project.title,
    status: "plan-only",
    nativeModuleName: "ForgeScanIOSSplatting",
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
      "ARKit capability check",
      `${model.label} model readiness check`,
      "Vision or Core ML segmentation",
      "Camera pose estimation",
      "Multi-rotation alignment",
      "Swift/C++ or Metal splat optimization",
      ".ksplat export",
      "MP4/GIF preview export"
    ]
  };
}
