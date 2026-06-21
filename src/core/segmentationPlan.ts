import { ForgeScanProjectManifest, RotationId } from "./manifest";
import {
  FrameMaskArtifact,
  SegmentationEngineName,
  SegmentationStatus
} from "../segmentation/SegmentationTypes";
import {
  createRawMaskPath,
  createRefinedMaskPath
} from "../segmentation/maskPaths";

export interface SegmentationPlanStage {
  id:
    | "source-frame-read"
    | "object-segmentation"
    | "raw-mask-write"
    | "mask-refinement"
    | "refined-mask-write"
    | "mask-validation";
  label: string;
  status: "planned";
  notes: string;
}

export interface SegmentationPlan {
  projectId: string;
  projectTitle: string;
  createdAt: string;
  status: SegmentationStatus;
  engine: SegmentationEngineName;
  totalSourceFrames: number;
  expectedRawMasks: number;
  expectedRefinedMasks: number;
  inputFramePaths: string[];
  outputMaskPaths: string[];
  stages: SegmentationPlanStage[];
}

export function createExpectedMaskArtifacts(
  manifest: ForgeScanProjectManifest
): FrameMaskArtifact[] {
  return manifest.capture.rotations.flatMap((rotation) =>
    rotation.frames.map((frame) => ({
      rotationId: rotation.id,
      frameIndex: frame.index,
      sourceFrameUri: frame.uri,
      rawMaskPath: createRawMaskPath(rotation.id, frame.index),
      refinedMaskPath: createRefinedMaskPath(rotation.id, frame.index),
      status: "planned" as const,
      notes: []
    }))
  );
}

export function countCapturedFrames(
  manifest: ForgeScanProjectManifest
): number {
  return manifest.capture.rotations.reduce(
    (sum, rotation) => sum + rotation.frames.length,
    0
  );
}

export function validateSegmentationReadiness(
  manifest: ForgeScanProjectManifest
): { ready: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (countCapturedFrames(manifest) === 0) {
    errors.push("At least one captured frame is required for segmentation.");
  }

  for (const rotation of manifest.capture.rotations) {
    if (rotation.required && rotation.status !== "complete") {
      errors.push(`${rotation.label} is required and is not complete.`);
    }

    if (rotation.status === "complete" && rotation.frames.length === 0) {
      errors.push(`${rotation.label} is complete but has zero frames.`);
    }

    if (!rotation.required && rotation.status !== "complete") {
      warnings.push(`${rotation.label} is optional and has not been captured.`);
    }
  }

  return {
    ready: errors.length === 0,
    errors,
    warnings
  };
}

export function validateMaskArtifactCoverage(
  manifest: ForgeScanProjectManifest,
  artifacts: FrameMaskArtifact[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const expectedArtifacts = createExpectedMaskArtifacts(manifest);

  for (const expected of expectedArtifacts) {
    const artifact = artifacts.find(
      (candidate) =>
        candidate.rotationId === expected.rotationId &&
        candidate.frameIndex === expected.frameIndex
    );

    if (!artifact) {
      errors.push(
        `Missing mask artifact for ${expected.rotationId} frame ${expected.frameIndex}.`
      );
      continue;
    }

    if (artifact.rawMaskPath !== expected.rawMaskPath) {
      errors.push(
        `Raw mask path mismatch for ${expected.rotationId} frame ${expected.frameIndex}.`
      );
    }

    if (artifact.refinedMaskPath !== expected.refinedMaskPath) {
      errors.push(
        `Refined mask path mismatch for ${expected.rotationId} frame ${expected.frameIndex}.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function createSegmentationPlan(
  manifest: ForgeScanProjectManifest
): SegmentationPlan {
  const expectedArtifacts = createExpectedMaskArtifacts(manifest);
  const inputFramePaths = manifest.capture.rotations.flatMap((rotation) =>
    rotation.frames.map((frame) =>
      createRotationFramePath(rotation.id, frame.filename)
    )
  );
  const outputMaskPaths = expectedArtifacts.flatMap((artifact) => [
    artifact.rawMaskPath,
    artifact.refinedMaskPath
  ]);

  return {
    projectId: manifest.project.id,
    projectTitle: manifest.project.title,
    createdAt: new Date().toISOString(),
    status: "planned",
    engine: "fallback-local",
    totalSourceFrames: expectedArtifacts.length,
    expectedRawMasks: expectedArtifacts.length,
    expectedRefinedMasks: expectedArtifacts.length,
    inputFramePaths,
    outputMaskPaths,
    stages: [
      {
        id: "source-frame-read",
        label: "Source frame read",
        status: "planned",
        notes: "Read ordered captured frames from project storage."
      },
      {
        id: "object-segmentation",
        label: "Object segmentation",
        status: "planned",
        notes: "Run fallback-local foreground segmentation."
      },
      {
        id: "raw-mask-write",
        label: "Raw mask write",
        status: "planned",
        notes: "Write deterministic raw mask files."
      },
      {
        id: "mask-refinement",
        label: "Mask refinement",
        status: "planned",
        notes: "Prepare refined fallback masks for reconstruction input."
      },
      {
        id: "refined-mask-write",
        label: "Refined mask write",
        status: "planned",
        notes: "Write deterministic refined mask files."
      },
      {
        id: "mask-validation",
        label: "Mask validation",
        status: "planned",
        notes: "Verify every captured frame has expected mask artifacts."
      }
    ]
  };
}

export function segmentationPlanJson(
  manifest: ForgeScanProjectManifest
): string {
  return JSON.stringify(createSegmentationPlan(manifest), null, 2);
}

function createRotationFramePath(
  rotationId: RotationId,
  filename: string
): string {
  return `rotations/${rotationId}/${filename}`;
}
