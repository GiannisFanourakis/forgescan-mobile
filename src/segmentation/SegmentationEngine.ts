import { CapturedFrame, ForgeScanProjectManifest, RotationId } from "../core/manifest";
import {
  FrameMaskArtifact,
  MaskPreviewOverlayData,
  SegmentationFrameResult,
  SegmentationProjectResult,
  SegmentationRotationResult
} from "./SegmentationTypes";

export interface SegmentationEngine {
  runSegmentationForProject(
    manifest: ForgeScanProjectManifest
  ): Promise<SegmentationProjectResult>;
  runSegmentationForRotation(
    manifest: ForgeScanProjectManifest,
    rotationId: RotationId
  ): Promise<SegmentationRotationResult>;
  runSegmentationForFrame(
    manifest: ForgeScanProjectManifest,
    rotationId: RotationId,
    frame: CapturedFrame
  ): Promise<SegmentationFrameResult>;
  saveRawMask(
    manifest: ForgeScanProjectManifest,
    artifact: FrameMaskArtifact
  ): string;
  saveRefinedMask(
    manifest: ForgeScanProjectManifest,
    artifact: FrameMaskArtifact
  ): string;
  createMaskPreviewOverlayData(
    artifact: FrameMaskArtifact
  ): MaskPreviewOverlayData;
}
