import { RotationId } from "../core/manifest";

export function createMaskFilename(frameIndex: number): string {
  return `frame_${String(frameIndex).padStart(3, "0")}.png`;
}

export function createRawMaskPath(
  rotationId: RotationId,
  frameIndex: number
): string {
  return `masks/raw/${rotationId}/${createMaskFilename(frameIndex)}`;
}

export function createRefinedMaskPath(
  rotationId: RotationId,
  frameIndex: number
): string {
  return `masks/refined/${rotationId}/${createMaskFilename(frameIndex)}`;
}
