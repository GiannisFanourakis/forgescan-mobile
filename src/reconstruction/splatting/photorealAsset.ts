import { ForgeScanProjectManifest } from "../../core/manifest";

export type PhotorealAssetFormat = "ksplat" | "splat-ply";

export type PhotorealAssetStatus =
  | "not-started"
  | "processing"
  | "generated"
  | "requires-native-build"
  | "requires-external-optimizer"
  | "failed";

export interface PhotorealAsset {
  format: PhotorealAssetFormat;
  filename: string;
  path: string;
  uri?: string;
  status: PhotorealAssetStatus;
  createdAt?: string;
  sourceFrames: string[];
  sourceMasks: string[];
  cameraDataPath: string;
  notes: string[];
}

export function createPhotorealAsset(
  manifest: ForgeScanProjectManifest,
  status: PhotorealAssetStatus = "requires-native-build",
  uri?: string
): PhotorealAsset {
  const asset: PhotorealAsset = {
    format: "ksplat",
    filename: getPhotorealAssetFilename(manifest),
    path: getExpectedKsplatPath(manifest),
    status,
    sourceFrames: manifest.capture.rotations.flatMap((rotation) =>
      rotation.frames.map((frame) => frame.uri)
    ),
    sourceMasks: manifest.capture.rotations.flatMap((rotation) =>
      rotation.frames.map(
        (frame) =>
          `advanced/masks/refined/${rotation.id}/frame_${String(frame.index).padStart(3, "0")}.png`
      )
    ),
    cameraDataPath: "photoreal/cameras.json",
    notes: [
      "ForgeScan treats .ksplat as the primary photoreal scan asset.",
      "Expo Go can capture and prepare data, but real .ksplat generation requires a development/native build."
    ]
  };

  if (uri !== undefined) {
    asset.uri = uri;
  }

  if (status === "generated") {
    asset.createdAt = new Date().toISOString();
  }

  return asset;
}

export function getExpectedKsplatPath(
  manifest: ForgeScanProjectManifest
): string {
  return `photoreal/${getPhotorealAssetFilename(manifest)}`;
}

export function getPhotorealAssetFilename(
  manifest: ForgeScanProjectManifest
): string {
  return `ForgeScan_${sanitizeAssetName(manifest.project.title)}.ksplat`;
}

export function getPhotorealStatusLabel(
  status: PhotorealAssetStatus
): string {
  switch (status) {
    case "generated":
      return "Generated";
    case "requires-native-build":
      return "Requires native build";
    case "requires-external-optimizer":
      return "Requires native build";
    case "failed":
      return "Failed";
    case "processing":
      return "Processing";
    case "not-started":
      return "Not started";
  }
}

function sanitizeAssetName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return sanitized.length > 0 ? sanitized : "Untitled_Scan";
}
