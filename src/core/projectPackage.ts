import {
  applyProjectValidationToManifest,
  validateProjectForReconstruction
} from "./frameValidation";
import {
  CaptureRotation,
  ForgeScanProjectManifest,
  RotationId
} from "./manifest";
import {
  ExportTargetPlan,
  createExportTargetPlan
} from "./exportTargets";
import {
  ReconstructionPlan,
  createReconstructionPlan
} from "./reconstructionPlan";

export interface ProjectPackageFile {
  path: string;
  role:
    | "manifest"
    | "frame"
    | "video"
    | "thumbnail"
    | "export-folder"
    | "export-target";
  sourceUri?: string;
}

export interface ProjectPackagePlaceholder {
  projectId: string;
  rootFolder: string;
  manifestPath: "manifest.json";
  folders: string[];
  files: ProjectPackageFile[];
}

export interface PreparedExternalProcessingPackage {
  ready: boolean;
  manifestJson: string;
  packagePlaceholder: ProjectPackagePlaceholder;
  reconstructionPlan: ReconstructionPlan;
  exportTargetPlan: ExportTargetPlan;
  errors: string[];
  warnings: string[];
}

export function createProjectPackagePlaceholder(
  manifest: ForgeScanProjectManifest
): ProjectPackagePlaceholder {
  const rotationFolders = manifest.capture.rotations.map(
    (rotation) => `rotations/${rotation.id}`
  );

  return {
    projectId: manifest.project.id,
    rootFolder: "project",
    manifestPath: "manifest.json",
    folders: [...rotationFolders, "thumbnails", "exports"],
    files: [
      {
        path: "manifest.json",
        role: "manifest"
      },
      ...manifest.capture.rotations.flatMap(createFrameFileEntries),
      ...manifest.capture.rotations.flatMap(createVideoFileEntries),
      {
        path: "thumbnails/",
        role: "thumbnail"
      },
      {
        path: "exports/",
        role: "export-folder"
      },
      ...createExportTargetPlan(manifest).artifacts.map((artifact) => ({
        path: artifact.path,
        role: "export-target" as const
      }))
    ]
  };
}

export function exportProjectManifestJson(
  manifest: ForgeScanProjectManifest
): string {
  return JSON.stringify(applyProjectValidationToManifest(manifest), null, 2);
}

export function prepareProjectForExternalProcessing(
  manifest: ForgeScanProjectManifest
): PreparedExternalProcessingPackage {
  const validation = validateProjectForReconstruction(manifest);
  const validatedManifest = applyProjectValidationToManifest(
    manifest,
    validation
  );

  return {
    ready: validation.validForReconstruction,
    manifestJson: JSON.stringify(validatedManifest, null, 2),
    packagePlaceholder: createProjectPackagePlaceholder(validatedManifest),
    reconstructionPlan: createReconstructionPlan(validatedManifest),
    exportTargetPlan: createExportTargetPlan(validatedManifest),
    errors: validation.errors,
    warnings: validation.warnings
  };
}

function createFrameFileEntries(
  rotation: CaptureRotation
): ProjectPackageFile[] {
  return rotation.frames.map((frame) => ({
    path: createRotationFramePath(rotation.id, frame.filename),
    role: "frame",
    sourceUri: frame.uri
  }));
}

function createVideoFileEntries(
  rotation: CaptureRotation
): ProjectPackageFile[] {
  return (rotation.videos ?? []).map((video) => ({
    path: createRotationVideoPath(rotation.id, video.filename),
    role: "video",
    sourceUri: video.uri
  }));
}

function createRotationFramePath(rotationId: RotationId, filename: string): string {
  return `rotations/${rotationId}/${filename}`;
}

function createRotationVideoPath(rotationId: RotationId, filename: string): string {
  return `rotations/${rotationId}/${filename}`;
}
