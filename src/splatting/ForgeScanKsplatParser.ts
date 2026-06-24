import { File } from "expo-file-system";

export interface ParsedForgeScanSplat {
  x: number;
  y: number;
  z: number;
  scale: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ParsedForgeScanKsplat {
  splatCount: number;
  renderedSplats: ParsedForgeScanSplat[];
  bytes: number;
  warnings: string[];
}

const HEADER_SIZE = 4096;
const SECTION_HEADER_SIZE = 1024;
const BYTES_PER_SPLAT = 44;
const DATA_BASE = HEADER_SIZE + SECTION_HEADER_SIZE;
const MAX_RENDERED_SPLATS = 18000;

export async function parseForgeScanKsplat(
  uri: string
): Promise<ParsedForgeScanKsplat> {
  const bytes = await new File(uri).bytes();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const warnings: string[] = [];

  if (bytes.byteLength < DATA_BASE) {
    throw new Error("The .ksplat file is too small to preview.");
  }

  const splatCount = view.getInt32(12, true);
  if (splatCount <= 0) {
    throw new Error("The .ksplat file does not contain splats.");
  }

  const availableSplats = Math.floor(
    Math.max(0, bytes.byteLength - DATA_BASE) / BYTES_PER_SPLAT
  );
  const readableSplats = Math.min(splatCount, availableSplats);

  if (readableSplats < splatCount) {
    warnings.push("The file ended before every declared splat could be read.");
  }

  const stride = Math.max(1, Math.ceil(readableSplats / MAX_RENDERED_SPLATS));
  const renderedSplats: ParsedForgeScanSplat[] = [];

  for (let index = 0; index < readableSplats; index += stride) {
    const base = DATA_BASE + index * BYTES_PER_SPLAT;
    renderedSplats.push({
      x: view.getFloat32(base, true),
      y: view.getFloat32(base + 4, true),
      z: view.getFloat32(base + 8, true),
      scale: view.getFloat32(base + 12, true),
      r: view.getUint8(base + 40),
      g: view.getUint8(base + 41),
      b: view.getUint8(base + 42),
      a: view.getUint8(base + 43)
    });
  }

  if (stride > 1) {
    warnings.push(`Preview is showing ${renderedSplats.length}/${splatCount} splats.`);
  }

  return {
    splatCount,
    renderedSplats,
    bytes: bytes.byteLength,
    warnings
  };
}
