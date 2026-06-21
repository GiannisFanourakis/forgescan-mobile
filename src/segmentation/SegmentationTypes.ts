import { CapturedFrame, RotationId } from "../core/manifest";

export type SegmentationEngineName =
  | "none"
  | "on-device-preview"
  | "external"
  | "future-ai"
  | "fallback-local";
export type SegmentationStatus =
  | "not-started"
  | "planned"
  | "processing"
  | "complete"
  | "failed";
export type MaskKind = "raw" | "refined";
export type MaskFormat = "png" | "json";
export type MaskArtifactStatus = "planned" | "complete" | "failed";

export interface FrameMaskArtifact {
  rotationId: RotationId;
  frameIndex: number;
  sourceFrameUri: string;
  rawMaskPath: string;
  refinedMaskPath: string;
  rawMaskUri?: string;
  refinedMaskUri?: string;
  status: MaskArtifactStatus;
  createdAt?: string;
  notes: string[];
}

export interface MaskPreviewOverlayData {
  rotationId: RotationId;
  frameIndex: number;
  sourceFrameUri: string;
  maskUri?: string;
  opacity: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface SegmentationFrameResult {
  frame: CapturedFrame;
  artifact: FrameMaskArtifact;
  preview: MaskPreviewOverlayData;
}

export interface SegmentationRotationResult {
  rotationId: RotationId;
  totalFrames: number;
  successfulFrames: number;
  failedFrames: number;
  artifacts: FrameMaskArtifact[];
  previews: MaskPreviewOverlayData[];
  errors: string[];
}

export interface SegmentationProjectResult {
  projectId: string;
  status: SegmentationStatus;
  engine: SegmentationEngineName;
  createdAt: string;
  totalFrames: number;
  successfulFrames: number;
  failedFrames: number;
  artifacts: FrameMaskArtifact[];
  previews: MaskPreviewOverlayData[];
  rotationResults: SegmentationRotationResult[];
  errors: string[];
  notes: string[];
}
