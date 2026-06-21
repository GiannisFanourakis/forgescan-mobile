import { ForgeScanProjectManifest } from "../core/manifest";
import {
  PhotorealAsset,
  getPhotorealStatusLabel
} from "../reconstruction/splatting/photorealAsset";

export type NormalExportType = "ksplat" | "mp4" | "gif";

export type InternalArtifactType =
  | "splat-ply"
  | "obj"
  | "glb"
  | "stl"
  | "usdz"
  | "ply"
  | "json"
  | "png"
  | "jpg"
  | "html"
  | "masks"
  | "frames"
  | "logs";

export interface NormalExportItem {
  type: NormalExportType;
  label: string;
  filename: string;
  path: string;
  status: "Generated" | "Requires native/external splat optimizer" | "Failed" | "Unavailable";
  uri?: string;
}

export function createNormalExportItems(
  manifest: ForgeScanProjectManifest,
  photorealAsset: PhotorealAsset
): NormalExportItem[] {
  const ksplatItem: NormalExportItem = {
    type: "ksplat",
    label: "Photoreal 3D Scan",
    filename: photorealAsset.filename,
    path: photorealAsset.path,
    status: getPhotorealStatusLabel(photorealAsset.status) as NormalExportItem["status"]
  };

  if (photorealAsset.uri !== undefined) {
    ksplatItem.uri = photorealAsset.uri;
  }

  return [
    ksplatItem,
    {
      type: "mp4",
      label: "Preview Video",
      filename: "preview.mp4",
      path: "preview/preview.mp4",
      status: "Unavailable"
    },
    {
      type: "gif",
      label: "Preview GIF",
      filename: "preview.gif",
      path: "preview/preview.gif",
      status: "Unavailable"
    }
  ];
}
