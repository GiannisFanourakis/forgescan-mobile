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
import { getExpectedKsplatPath } from "../reconstruction/splatting/photorealAsset";

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
      label: "Object mask preparation",
      status: "planned",
      inputs: rotationFolders,
      outputs: ["masks/raw/"],
      notes:
        "Use the selected AI model path to separate the object from ordered source frames before pose solving."
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
      label: "Splat data preparation",
      status: "planned",
      inputs: ["alignment/rotation_alignment.json", "masks/refined/"],
      outputs: ["photoreal/splatting-job.json", "photoreal/cameras.json"],
      notes: `${aiModelLabel} prepares optimizer-ready splat data from aligned frame sets.`
    },
    {
      sequence: 6,
      id: "texture-projection",
      label: "Source detail preparation",
      status: "planned",
      inputs: ["photoreal/splatting-job.json", ...rotationFolders],
      outputs: ["photoreal/source-detail.json"],
      notes: "Preserve captured image detail for the splat optimizer."
    },
    {
      sequence: 7,
      id: "cleanup",
      label: "Splat input cleanup",
      status: "planned",
      inputs: ["photoreal/source-detail.json"],
      outputs: ["photoreal/optimizer-input.json"],
      notes:
        "Normalize source data before native .ksplat optimization."
    },
    {
      sequence: 8,
      id: "model-export",
      label: "Export .ksplat target",
      status: "planned",
      inputs: ["photoreal/optimizer-input.json"],
      outputs: [getExpectedKsplatPath(manifest)],
      notes: "ForgeScan's normal final 3D export is the .ksplat photoreal scan."
    },
    {
      sequence: 9,
      id: "preview-export",
      label: "Export preview media",
      status: "planned",
      inputs: [getExpectedKsplatPath(manifest)],
      outputs: ["preview/preview.mp4", "preview/preview.gif"],
      notes: "Preview video and GIF are preview-only exports."
    }
  ];
}
