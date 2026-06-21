import {
  ExportFormat,
  ForgeScanProjectManifest,
  ReconstructionModelId,
  ReconstructionModelRuntime,
  ReconstructionModelStatus
} from "./manifest";
import {
  ReconstructionModelInputType,
  getSelectedReconstructionModel
} from "../reconstruction/modelRegistry";

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
    totalVideos: number;
  };
  aiModel: {
    id: ReconstructionModelId;
    label: string;
    version: string;
    runtime: ReconstructionModelRuntime;
    status: ReconstructionModelStatus;
    inputTypes: ReconstructionModelInputType[];
    minFrames: number;
    recommendedFrames: number;
    summary: string;
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
  const totalVideos = manifest.capture.rotations.reduce(
    (sum, rotation) => sum + (rotation.videos ?? []).length,
    0
  );
  const aiModel = getSelectedReconstructionModel(manifest);

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
      totalFrames,
      totalVideos
    },
    aiModel: {
      id: aiModel.id,
      label: aiModel.label,
      version: aiModel.version,
      runtime: aiModel.runtime,
      status: aiModel.status,
      inputTypes: [...aiModel.inputTypes],
      minFrames: aiModel.minFrames,
      recommendedFrames: aiModel.recommendedFrames,
      summary: aiModel.summary
    },
    targetFormats: [...manifest.processing.reconstruction.targetFormats],
    stages: createPlanStages(manifest, aiModel.label)
  };
}

function createPlanStages(
  manifest: ForgeScanProjectManifest,
  aiModelLabel: string
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
        "Use the selected AI model to segment the object from ordered source frames before pose solving."
    },
    {
      sequence: 2,
      id: "mask-refinement",
      label: "Mask refinement",
      status: "planned",
      inputs: ["masks/raw/"],
      outputs: ["masks/refined/"],
      notes:
        "Improve mask edges and flag transparent or reflective regions."
    },
    {
      sequence: 3,
      id: "camera-pose-estimation",
      label: "Camera pose estimation",
      status: "planned",
      inputs: rotationFolders,
      outputs: ["poses/camera_poses.json"],
      notes:
        "Estimate camera positions from ordered rotation frames and compatible capture video."
    },
    {
      sequence: 4,
      id: "rotation-alignment",
      label: "Rotation alignment",
      status: "planned",
      inputs: ["poses/camera_poses.json", "manifest.json"],
      outputs: ["alignment/rotation_alignment.json"],
      notes:
        "Merge upright, tilted, and optional underside coverage into one object frame."
    },
    {
      sequence: 5,
      id: "reconstruction",
      label: "Mesh or splat reconstruction",
      status: "planned",
      inputs: ["alignment/rotation_alignment.json", "masks/refined/"],
      outputs: ["reconstruction/raw_model"],
      notes: `${aiModelLabel} generates raw geometry or splat data from aligned frame sets.`
    },
    {
      sequence: 6,
      id: "texture-projection",
      label: "Texture projection",
      status: "planned",
      inputs: ["reconstruction/raw_model", ...rotationFolders],
      outputs: ["reconstruction/textured_model"],
      notes: "Bake texture detail from captured frames."
    },
    {
      sequence: 7,
      id: "cleanup",
      label: "Cleanup",
      status: "planned",
      inputs: ["reconstruction/textured_model"],
      outputs: ["reconstruction/final_model"],
      notes:
        "Apply hole filling, texture repair, and scale normalization."
    },
    {
      sequence: 8,
      id: "model-export",
      label: "Export GLB/USDZ/OBJ/STL",
      status: "planned",
      inputs: ["reconstruction/final_model"],
      outputs: ["exports/model.glb", "exports/model.usdz", "exports/model.obj", "exports/model.stl"],
      notes: "Model export targets for web, AR, 3D software, and printing."
    },
    {
      sequence: 9,
      id: "preview-export",
      label: "Export HTML/MP4/GIF preview",
      status: "planned",
      inputs: ["reconstruction/final_model"],
      outputs: ["exports/viewer.html", "exports/preview.mp4", "exports/preview.gif"],
      notes: "Presentation exports for interactive and animated previews."
    }
  ];
}
