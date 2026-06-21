import { Directory, File, Paths } from "expo-file-system";

import {
  ForgeScanProjectManifest,
  RotationId,
  createFrameFilename,
  createVideoFilename
} from "../core/manifest";

export interface ProjectStoragePaths {
  rootUri: string;
  projectUri: string;
  manifestUri: string;
  rotationsUri: string;
  masksUri: string;
  reconstructionUri: string;
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

export function deleteProjectStorage(projectId: string): void {
  const projectDirectory = getProjectDirectory(projectId);

  if (projectDirectory.exists) {
    projectDirectory.delete();
  }
}

export function getProjectStoragePaths(
  manifest: ForgeScanProjectManifest
): ProjectStoragePaths {
  const rootDirectory = getProjectsRootDirectory();
  const projectDirectory = getProjectDirectory(manifest.project.id);
  const rotationsDirectory = new Directory(projectDirectory, "rotations");
  const masksDirectory = new Directory(projectDirectory, "masks");
  const reconstructionDirectory = new Directory(
    projectDirectory,
    "reconstruction"
  );
  const thumbnailsDirectory = new Directory(projectDirectory, "thumbnails");
  const exportsDirectory = new Directory(projectDirectory, "exports");
  const manifestFile = new File(projectDirectory, "manifest.json");

  return {
    rootUri: rootDirectory.uri,
    projectUri: projectDirectory.uri,
    manifestUri: manifestFile.uri,
    rotationsUri: rotationsDirectory.uri,
    masksUri: masksDirectory.uri,
    reconstructionUri: reconstructionDirectory.uri,
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
  const masksDirectory = new Directory(projectDirectory, "masks");
  const reconstructionDirectory = new Directory(
    projectDirectory,
    "reconstruction"
  );
  const thumbnailsDirectory = new Directory(projectDirectory, "thumbnails");
  const exportsDirectory = new Directory(projectDirectory, "exports");

  rootDirectory.create({ intermediates: true, idempotent: true });
  projectDirectory.create({ intermediates: true, idempotent: true });
  rotationsDirectory.create({ intermediates: true, idempotent: true });
  masksDirectory.create({ intermediates: true, idempotent: true });
  reconstructionDirectory.create({ intermediates: true, idempotent: true });
  thumbnailsDirectory.create({ intermediates: true, idempotent: true });
  exportsDirectory.create({ intermediates: true, idempotent: true });

  const rawMasksDirectory = new Directory(masksDirectory, "raw");
  const refinedMasksDirectory = new Directory(masksDirectory, "refined");
  rawMasksDirectory.create({ intermediates: true, idempotent: true });
  refinedMasksDirectory.create({ intermediates: true, idempotent: true });

  for (const rotation of manifest.capture.rotations) {
    new Directory(rotationsDirectory, rotation.id).create({
      intermediates: true,
      idempotent: true
    });
    new Directory(rawMasksDirectory, rotation.id).create({
      intermediates: true,
      idempotent: true
    });
    new Directory(refinedMasksDirectory, rotation.id).create({
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
  const manifestFile = new File(
    getProjectDirectory(manifest.project.id),
    "manifest.json"
  );

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
  const manifestFile = new File(
    getProjectDirectory(manifest.project.id),
    "manifest.json"
  );

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
  return writeProjectExportFile(manifest, filename, jsonContent);
}

export function writeProjectExportFile(
  manifest: ForgeScanProjectManifest,
  filename: string,
  content: string | Uint8Array
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

  exportFile.write(content);
  return exportFile.uri;
}

export function writeProjectFile(
  manifest: ForgeScanProjectManifest,
  relativePath: string,
  content: string | Uint8Array
): string {
  ensureProjectStorage(manifest);
  const pathParts = relativePath.split(/[\\/]/).filter(Boolean);
  const filename = pathParts.pop();

  if (!filename) {
    throw new Error("Cannot write project file without a filename.");
  }

  const directory = ensureProjectRelativeDirectory(
    manifest.project.id,
    pathParts
  );
  const file = new File(directory, filename);

  if (!file.exists) {
    file.create({ intermediates: true, overwrite: true });
  }

  file.write(content);
  return file.uri;
}

function ensureProjectRelativeDirectory(
  projectId: string,
  pathParts: string[]
): Directory {
  let directory = getProjectDirectory(projectId);

  directory.create({ intermediates: true, idempotent: true });

  for (const part of pathParts) {
    directory = new Directory(directory, part);
    directory.create({ intermediates: true, idempotent: true });
  }

  return directory;
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

export function createStoredVideoUri(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId,
  videoIndex: number
): string {
  const rotationDirectory = new Directory(
    getProjectDirectory(manifest.project.id),
    "rotations",
    rotationId
  );
  return new File(rotationDirectory, createVideoFilename(videoIndex)).uri;
}

export async function copyCapturedFrameToProject(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId,
  sourceUri: string,
  frameIndex: number
): Promise<string> {
  ensureProjectStorage(manifest);

  const rotationDirectory = new Directory(
    getProjectDirectory(manifest.project.id),
    "rotations",
    rotationId
  );
  rotationDirectory.create({ intermediates: true, idempotent: true });

  const destinationFile = new File(
    rotationDirectory,
    createFrameFilename(frameIndex)
  );
  const sourceFile = new File(sourceUri);

  if (destinationFile.exists) {
    destinationFile.delete();
  }

  await sourceFile.copy(destinationFile);
  return destinationFile.uri;
}

export async function copyCapturedVideoToProject(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId,
  sourceUri: string,
  videoIndex: number
): Promise<string> {
  ensureProjectStorage(manifest);

  const rotationDirectory = new Directory(
    getProjectDirectory(manifest.project.id),
    "rotations",
    rotationId
  );
  rotationDirectory.create({ intermediates: true, idempotent: true });

  const destinationFile = new File(
    rotationDirectory,
    createVideoFilename(videoIndex)
  );
  const sourceFile = new File(sourceUri);

  if (destinationFile.exists) {
    destinationFile.delete();
  }

  await sourceFile.copy(destinationFile);
  return destinationFile.uri;
}

export function deleteStoredFile(uri: string): void {
  try {
    const file = new File(uri);

    if (file.exists) {
      file.delete();
    }
  } catch {
    // Older manifests may contain non-file URIs from earlier capture builds.
  }
}
