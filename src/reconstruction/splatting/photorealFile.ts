import { File } from "expo-file-system";

import { ForgeScanProjectManifest } from "../../core/manifest";
import { getProjectDirectory } from "../../storage/projectStorage";
import {
  getExpectedKsplatPath,
  getPhotorealAssetFilename
} from "./photorealAsset";

export interface PhotorealFileInfo {
  filename: string;
  path: string;
  uri: string;
  exists: boolean;
  size: number;
}

export function getPhotorealFileInfo(
  manifest: ForgeScanProjectManifest,
  overrideUri?: string
): PhotorealFileInfo {
  const path = getExpectedKsplatPath(manifest);
  const file =
    overrideUri === undefined
      ? new File(getProjectDirectory(manifest.project.id), ...path.split("/"))
      : new File(overrideUri);

  return {
    filename: getPhotorealAssetFilename(manifest),
    path,
    uri: file.uri,
    exists: file.exists,
    size: file.exists ? file.size : 0
  };
}

export function isGeneratedPhotorealFile(file: PhotorealFileInfo): boolean {
  return file.exists && file.size > 0;
}
