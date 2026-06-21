import { ExportFormat, ForgeScanProjectManifest } from "./manifest";

export type ReconstructionStageStatus = "planned" | "blocked" | "complete";

export interface ReconstructionPlanStage {
  sequence: number;
  id:
    | "background-removal"
    | "mask-refinement"
    | "camera-pose-estimation"
    | "rotation-alignment"
    | "reconstruction"
    | "texture-projection"
    | "cleanup"
    | "model-export"
    | "preview-export";
  label: string;
  status: ReconstructionStageStatus;
  inputs: string[];
  outputs: string[];
  notes: string;
}

export interface ReconstructionPlan {
  projectId: string;
  projectTitle: string;
  createdAt: string;
  status: "plan-only";
  captureSummary: {
    mode: ForgeScanProjectManifest["capture"]["mode"];
    targetFrameCount: number;
    completedRotations: number;
    totalRotations: number;
    totalFrames: number;
  };
  targetFormats: ExportFormat[];
  stages: ReconstructionPlanStage[];
}

export function createReconstructionPlan(
  manifest: ForgeScanProjectManifest
): ReconstructionPlan {
  const completedRotations = manifest.capture.rotations.filter(
    (rotation) => rotation.status === "complete"
  );
  const totalFrames = manifest.capture.rotations.reduce(
    (sum, rotation) => sum + rotation.frames.length,
    0
  );

  return {
    projectId: manifest.project.id,
    projectTitle: manifest.project.title,
    createdAt: new Date().toISOString(),
    status: "plan-only",
    captureSummary: {
      mode: manifest.capture.mode,
      targetFrameCount: manifest.capture.targetFrameCount,
      completedRotations: completedRotations.length,
      totalRotations: manifest.capture.rotations.length,
      totalFrames
    },
    targetFormats: [...manifest.processing.reconstruction.targetFormats],
    stages: createPlanStages(manifest)
  };
}

function createPlanStages(
  manifest: ForgeScanProjectManifest
): ReconstructionPlanStage[] {
  const rotationFolders = manifest.capture.rotations.map(
    (rotation) => `rotations/${rotation.id}/`
  );

  return [
    {
      sequence: 1,
      id: "background-removal",
      label: "Background removal",
      status: "planned",
      inputs: rotationFolders,
      outputs: ["masks/raw/"],
      notes:
        "Future segmentation step. This prototype records source frames only."
    },
    {
      sequence: 2,
      id: "mask-refinement",
      label: "Mask refinement",
      status: "planned",
      inputs: ["masks/raw/"],
      outputs: ["masks/refined/"],
      notes:
        "Future cleanup step for edge quality and transparent or reflective regions."
    },
    {
      sequence: 3,
      id: "camera-pose-estimation",
      label: "Camera pose estimation",
      status: "planned",
      inputs: rotationFolders,
      outputs: ["poses/camera_poses.json"],
      notes:
        "Future pose solver will estimate camera positions from ordered frames."
    },
    {
      sequence: 4,
      id: "rotation-alignment",
      label: "Rotation alignment",
      status: "planned",
      inputs: ["poses/camera_poses.json", "manifest.json"],
      outputs: ["alignment/rotation_alignment.json"],
      notes:
        "Future alignment step will merge upright, tilted, and optional underside coverage."
    },
    {
      sequence: 5,
      id: "reconstruction",
      label: "Mesh or splat reconstruction",
      status: "planned",
      inputs: ["alignment/rotation_alignment.json", "masks/refined/"],
      outputs: ["reconstruction/raw_model"],
      notes:
        "Future photogrammetry or Gaussian Splatting stage. No reconstruction runs here."
    },
    {
      sequence: 6,
      id: "texture-projection",
      label: "Texture projection",
      status: "planned",
      inputs: ["reconstruction/raw_model", ...rotationFolders],
      outputs: ["reconstruction/textured_model"],
      notes: "Future texture baking from captured frames."
    },
    {
      sequence: 7,
      id: "cleanup",
      label: "Cleanup",
      status: "planned",
      inputs: ["reconstruction/textured_model"],
      outputs: ["reconstruction/final_model"],
      notes:
        "Future cleanup may include hole filling, texture repair, and scale normalization."
    },
    {
      sequence: 8,
      id: "model-export",
      label: "Export GLB/USDZ/OBJ/STL",
      status: "planned",
      inputs: ["reconstruction/final_model"],
      outputs: ["exports/model.glb", "exports/model.usdz", "exports/model.obj", "exports/model.stl"],
      notes: "Future model export targets for web, AR, 3D software, and printing."
    },
    {
      sequence: 9,
      id: "preview-export",
      label: "Export HTML/MP4/GIF preview",
      status: "planned",
      inputs: ["reconstruction/final_model"],
      outputs: ["exports/viewer.html", "exports/preview.mp4", "exports/preview.gif"],
      notes: "Future presentation exports for interactive and animated previews."
    }
  ];
}
