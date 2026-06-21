import {
  CapturedFrame,
  ForgeScanProjectManifest,
  RotationId
} from "../core/manifest";
import { getNativeMaskingAvailability } from "../native/NativeMasking";
import { FallbackMaskingEngine } from "./FallbackMaskingEngine";
import { NativeMaskingEngine } from "./NativeMaskingEngine";
import {
  MaskingFrameResult,
  MaskingProjectResult,
  MaskingRotationResult
} from "./MaskingTypes";

const fallbackMaskingEngine = new FallbackMaskingEngine();
const nativeMaskingEngine = new NativeMaskingEngine();

export async function runMaskingForProject(
  manifest: ForgeScanProjectManifest
): Promise<MaskingProjectResult> {
  const availability = await getNativeMaskingAvailability();

  if (availability.available) {
    return nativeMaskingEngine.runMaskingForProject(manifest);
  }

  return fallbackMaskingEngine.runMaskingForProject(manifest);
}

export async function runMaskingForRotation(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId
): Promise<MaskingRotationResult> {
  const availability = await getNativeMaskingAvailability();

  if (availability.available) {
    return nativeMaskingEngine.runMaskingForRotation(manifest, rotationId);
  }

  return fallbackMaskingEngine.runMaskingForRotation(manifest, rotationId);
}

export async function runMaskingForFrame(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId,
  frame: CapturedFrame
): Promise<MaskingFrameResult> {
  const availability = await getNativeMaskingAvailability();

  if (availability.available) {
    return nativeMaskingEngine.runMaskingForFrame(manifest, rotationId, frame);
  }

  return fallbackMaskingEngine.runMaskingForFrame(manifest, rotationId, frame);
}

export { fallbackMaskingEngine, nativeMaskingEngine };
