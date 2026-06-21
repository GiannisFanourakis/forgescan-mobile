import { Directory, File, Paths } from "expo-file-system";

import {
  ForgeScanProjectManifest,
  RotationId,
  createFrameFilename
} from "../core/manifest";

export interface ProjectStoragePaths {
  rootUri: string;
  projectUri: string;
  manifestUri: string;
  rotationsUri: string;
  thumbnailsUri: string;
  exportsUri: string;
}

const APP_FOLDER_NAME = "ForgeScan";
const PROJECTS_FOLDER_NAME = "projects";

export function getProjectsRootDirectory(): Directory {
  return new Directory(Paths.document, APP_FOLDER_NAME, PROJECTS_FOLDER_NAME);
}

export function getProjectDirectory(projectId: string): Directory {
  return new Directory(getProjectsRootDirectory(), projectId);
}

export function getProjectStoragePaths(
  manifest: ForgeScanProjectManifest
): ProjectStoragePaths {
  const rootDirectory = getProjectsRootDirectory();
  const projectDirectory = getProjectDirectory(manifest.project.id);
  const rotationsDirectory = new Directory(projectDirectory, "rotations");
  const thumbnailsDirectory = new Directory(projectDirectory, "thumbnails");
  const exportsDirectory = new Directory(projectDirectory, "exports");
  const manifestFile = new File(projectDirectory, "manifest.json");

  return {
    rootUri: rootDirectory.uri,
    projectUri: projectDirectory.uri,
    manifestUri: manifestFile.uri,
    rotationsUri: rotationsDirectory.uri,
    thumbnailsUri: thumbnailsDirectory.uri,
    exportsUri: exportsDirectory.uri
  };
}

export function ensureProjectStorage(
  manifest: ForgeScanProjectManifest
): ProjectStoragePaths {
  const rootDirectory = getProjectsRootDirectory();
  const projectDirectory = getProjectDirectory(manifest.project.id);
  const rotationsDirectory = new Directory(projectDirectory, "rotations");
  const thumbnailsDirectory = new Directory(projectDirectory, "thumbnails");
  const exportsDirectory = new Directory(projectDirectory, "exports");

  rootDirectory.create({ intermediates: true, idempotent: true });
  projectDirectory.create({ intermediates: true, idempotent: true });
  rotationsDirectory.create({ intermediates: true, idempotent: true });
  thumbnailsDirectory.create({ intermediates: true, idempotent: true });
  exportsDirectory.create({ intermediates: true, idempotent: true });

  for (const rotation of manifest.capture.rotations) {
    new Directory(rotationsDirectory, rotation.id).create({
      intermediates: true,
      idempotent: true
    });
  }

  return getProjectStoragePaths(manifest);
}

export function persistProjectManifest(
  manifest: ForgeScanProjectManifest
): ProjectStoragePaths {
  const paths = ensureProjectStorage(manifest);
  const manifestFile = new File(getProjectDirectory(manifest.project.id), "manifest.json");

  if (!manifestFile.exists) {
    manifestFile.create({ intermediates: true, overwrite: true });
  }

  manifestFile.write(JSON.stringify(manifest, null, 2));
  return paths;
}

export function writeProjectManifestJson(
  manifest: ForgeScanProjectManifest,
  manifestJson: string
): string {
  ensureProjectStorage(manifest);
  const manifestFile = new File(getProjectDirectory(manifest.project.id), "manifest.json");

  if (!manifestFile.exists) {
    manifestFile.create({ intermediates: true, overwrite: true });
  }

  manifestFile.write(manifestJson);
  return manifestFile.uri;
}

export function writeProjectExportJson(
  manifest: ForgeScanProjectManifest,
  filename: string,
  jsonContent: string
): string {
  ensureProjectStorage(manifest);
  const exportsDirectory = new Directory(
    getProjectDirectory(manifest.project.id),
    "exports"
  );
  exportsDirectory.create({ intermediates: true, idempotent: true });

  const exportFile = new File(exportsDirectory, filename);
  if (!exportFile.exists) {
    exportFile.create({ intermediates: true, overwrite: true });
  }

  exportFile.write(jsonContent);
  return exportFile.uri;
}

export async function loadStoredProjectManifests(): Promise<
  ForgeScanProjectManifest[]
> {
  const rootDirectory = getProjectsRootDirectory();

  if (!rootDirectory.exists) {
    return [];
  }

  const entries = rootDirectory.list();
  const manifests: ForgeScanProjectManifest[] = [];

  for (const entry of entries) {
    if (!(entry instanceof Directory)) {
      continue;
    }

    const manifestFile = new File(entry, "manifest.json");
    if (!manifestFile.exists) {
      continue;
    }

    try {
      const manifest = JSON.parse(
        await manifestFile.text()
      ) as ForgeScanProjectManifest;
      manifests.push(manifest);
    } catch {
      // Ignore malformed project folders so one bad manifest does not block app startup.
    }
  }

  return manifests.sort((a, b) =>
    b.project.updatedAt.localeCompare(a.project.updatedAt)
  );
}

export function createStoredFrameUri(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId,
  frameIndex: number
): string {
  const rotationDirectory = new Directory(
    getProjectDirectory(manifest.project.id),
    "rotations",
    rotationId
  );
  return new File(rotationDirectory, createFrameFilename(frameIndex)).uri;
}
