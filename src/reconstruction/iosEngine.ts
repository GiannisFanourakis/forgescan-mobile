import { ForgeScanProjectManifest } from "../core/manifest";
import {
  PlatformReconstructionEngine,
  PlatformReconstructionJobPlan
} from "./types";

export const iosReconstructionEngine: PlatformReconstructionEngine = {
  platform: "ios",
  displayName: "iOS local reconstruction",
  nativeModuleName: "ForgeScanIOSReconstruction",
  implementationStatus: "native-planned",
  summary:
    "iOS will use the shared capture workflow, then add Swift, ARKit/RealityKit, Vision or Core ML, Metal acceleration, and USDZ-first export support.",
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
      label: "On-device segmentation",
      status: "planned",
      detail:
        "Vision or Core ML can generate masks before pose estimation and reconstruction."
    },
    {
      id: "reconstruction",
      label: "Native mesh or splat reconstruction",
      status: "requires-native-build",
      detail:
        "Local reconstruction should run in Swift/C++ or Metal-backed native code."
    },
    {
      id: "object-capture",
      label: "Apple reconstruction path",
      status: "planned",
      detail:
        "A native iOS track can evaluate RealityKit/Object Capture style workflows where device support allows it."
    },
    {
      id: "exports",
      label: "USDZ/GLB/OBJ/STL export",
      status: "planned",
      detail:
        "Export targets are defined now; binary model writers come after reconstruction output exists."
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
        "Expose Swift calls for masks, poses, alignment, reconstruction, and model export."
    },
    {
      order: 4,
      title: "Ship iOS local export",
      detail:
        "Prioritize USDZ and GLB once native reconstruction produces textured geometry."
    }
  ],
  createJobPlan: createIOSJobPlan
};

function createIOSJobPlan(
  manifest: ForgeScanProjectManifest
): PlatformReconstructionJobPlan {
  return {
    platform: "ios",
    projectId: manifest.project.id,
    projectTitle: manifest.project.title,
    status: "plan-only",
    nativeModuleName: "ForgeScanIOSReconstruction",
    requiredInputs: [
      "manifest.json",
      "rotations/upright/",
      "rotations/tilted/",
      "rotations/underside/"
    ],
    targetFormats: [...manifest.exports.formats],
    stages: [
      "ARKit capability check",
      "Vision or Core ML segmentation",
      "Camera pose estimation",
      "Multi-rotation alignment",
      "Swift/C++ or Metal reconstruction",
      "USDZ/GLB/OBJ/STL export",
      "HTML/MP4/GIF preview export"
    ]
  };
}
