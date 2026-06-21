import { ExportFormat, ForgeScanProjectManifest } from "./manifest";

export type ExportArtifactKind = "model" | "viewer" | "preview";
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
  ExportFormat,
  Omit<ExportArtifactTarget, "status" | "requiresReconstruction">
> = {
  glb: {
    format: "glb",
    label: "GLB binary 3D model",
    kind: "model",
    path: "exports/model.glb",
    mimeType: "model/gltf-binary"
  },
  usdz: {
    format: "usdz",
    label: "USDZ iOS AR model",
    kind: "model",
    path: "exports/model.usdz",
    mimeType: "model/vnd.usdz+zip"
  },
  obj: {
    format: "obj",
    label: "OBJ 3D model",
    kind: "model",
    path: "exports/model.obj",
    mimeType: "model/obj"
  },
  stl: {
    format: "stl",
    label: "STL printable mesh",
    kind: "model",
    path: "exports/model.stl",
    mimeType: "model/stl"
  },
  html: {
    format: "html",
    label: "HTML/WebGL viewer",
    kind: "viewer",
    path: "exports/viewer.html",
    mimeType: "text/html"
  },
  mp4: {
    format: "mp4",
    label: "MP4 preview render",
    kind: "preview",
    path: "exports/preview.mp4",
    mimeType: "video/mp4"
  },
  gif: {
    format: "gif",
    label: "GIF preview render",
    kind: "preview",
    path: "exports/preview.gif",
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
      "These are the intended 3D and preview export artifacts. Actual files are produced after reconstruction processing.",
    artifacts: manifest.exports.formats.map((format) => ({
      ...artifactTemplates[format],
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
