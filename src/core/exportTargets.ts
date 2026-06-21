import { ExportFormat, ForgeScanProjectManifest } from "./manifest";
import { getExpectedKsplatPath } from "../reconstruction/splatting/photorealAsset";

export type ExportArtifactKind =
  | "photoreal-scan"
  | "model"
  | "viewer"
  | "preview";
export type ExportArtifactStatus = "pending-reconstruction" | "ready" | "exported";

export interface ExportArtifactTarget {
  format: ExportFormat;
  label: string;
  kind: ExportArtifactKind;
  path: string;
  mimeType: string;
  status: ExportArtifactStatus;
  requiresReconstruction: boolean;
}

export interface ExportTargetPlan {
  projectId: string;
  projectTitle: string;
  createdAt: string;
  status: "targets-only";
  note: string;
  artifacts: ExportArtifactTarget[];
}

const artifactTemplates: Record<
  Exclude<ExportFormat, "ksplat">,
  Omit<ExportArtifactTarget, "status" | "requiresReconstruction">
> = {
  glb: {
    format: "glb",
    label: "Internal fallback GLB",
    kind: "model",
    path: "fallback/model.glb",
    mimeType: "model/gltf-binary"
  },
  usdz: {
    format: "usdz",
    label: "Internal fallback USDZ",
    kind: "model",
    path: "fallback/model.usdz",
    mimeType: "model/vnd.usdz+zip"
  },
  obj: {
    format: "obj",
    label: "Internal fallback OBJ",
    kind: "model",
    path: "fallback/model.obj",
    mimeType: "model/obj"
  },
  stl: {
    format: "stl",
    label: "Internal fallback STL",
    kind: "model",
    path: "fallback/model.stl",
    mimeType: "model/stl"
  },
  html: {
    format: "html",
    label: "Internal preview fallback",
    kind: "viewer",
    path: "open_viewer.html",
    mimeType: "text/html"
  },
  mp4: {
    format: "mp4",
    label: "Preview Video",
    kind: "preview",
    path: "preview/preview.mp4",
    mimeType: "video/mp4"
  },
  gif: {
    format: "gif",
    label: "Preview GIF",
    kind: "preview",
    path: "preview/preview.gif",
    mimeType: "image/gif"
  }
};

export function createExportTargetPlan(
  manifest: ForgeScanProjectManifest
): ExportTargetPlan {
  return {
    projectId: manifest.project.id,
    projectTitle: manifest.project.title,
    createdAt: new Date().toISOString(),
    status: "targets-only",
    note:
      "These are the intended .ksplat and preview export artifacts. Actual files are produced after splatting processing.",
    artifacts: manifest.exports.formats.map((format) => ({
      ...createArtifactTarget(format, manifest),
      status: "pending-reconstruction",
      requiresReconstruction: true
    }))
  };
}

export function exportTargetPlanJson(
  manifest: ForgeScanProjectManifest
): string {
  return JSON.stringify(createExportTargetPlan(manifest), null, 2);
}

function createArtifactTarget(
  format: ExportFormat,
  manifest: ForgeScanProjectManifest
): Omit<ExportArtifactTarget, "status" | "requiresReconstruction"> {
  if (format === "ksplat") {
    return {
      format,
      label: "Photoreal 3D Scan",
      kind: "photoreal-scan",
      path: getExpectedKsplatPath(manifest),
      mimeType: "model/vnd.ksplat"
    };
  }

  return artifactTemplates[format];
}
