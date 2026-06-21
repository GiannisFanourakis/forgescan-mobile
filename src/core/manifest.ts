export const PROJECT_SCHEMA_VERSION = "forgescan-project/v1";
export const APP_NAME = "ForgeScan";
export const APP_VERSION = "0.1.0";

export type ProjectSchemaVersion = typeof PROJECT_SCHEMA_VERSION;
export type CaptureMode = "controlled-turntable";
export type CapturePlan = "two-rotation" | "three-rotation";
export type RotationId = "upright" | "tilted" | "underside";
export type RotationStatus = "pending" | "capturing" | "complete";
export type BackgroundRemovalEngine = "none" | "external" | "future-ai";
export type ReconstructionEngine =
  | "none"
  | "photogrammetry"
  | "gaussian-splatting"
  | "external";
export type ReconstructionModelId =
  | "forgescan-ai-mobile-v1"
  | "forgescan-ai-splat-preview-v1"
  | "external-ai-reconstruction";
export type ReconstructionModelRuntime = "on-device" | "external";
export type ReconstructionModelStatus =
  | "capture-ready"
  | "requires-native-build"
  | "planned"
  | "external-ready";
export type ReconstructionStatus =
  | "not-started"
  | "planned"
  | "queued"
  | "processing"
  | "complete"
  | "failed";
export type ExportFormat =
  | "glb"
  | "usdz"
  | "obj"
  | "stl"
  | "html"
  | "mp4"
  | "gif";
export type QualityCheckState = "not-run" | "pass" | "warning" | "fail";

export const DEFAULT_RECONSTRUCTION_MODEL_ID: ReconstructionModelId =
  "forgescan-ai-mobile-v1";
export const DEFAULT_RECONSTRUCTION_MODEL_VERSION = "0.1-plan";

export interface AppMetadata {
  name: typeof APP_NAME;
  version: string;
}

export interface ProjectMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CameraMetadata {
  deviceModel?: string;
  lens?: string;
  focalLengthMm?: number;
  exposureTime?: string;
  iso?: number;
}

export interface FrameQualityChecks {
  blur: QualityCheckState;
  exposure: QualityCheckState;
  centered: QualityCheckState;
  notes: string[];
}

export interface CapturedFrame {
  index: number;
  filename: string;
  uri: string;
  width?: number;
  height?: number;
  capturedAt: string;
  camera?: CameraMetadata;
  qualityChecks: FrameQualityChecks;
}

export interface CapturedVideo {
  index: number;
  filename: string;
  uri: string;
  durationMs?: number;
  capturedAt: string;
}

export interface CaptureRotation {
  id: RotationId;
  label: string;
  required: boolean;
  status: RotationStatus;
  angleHint: string;
  frames: CapturedFrame[];
  videos?: CapturedVideo[];
}

export interface CaptureSettings {
  mode: CaptureMode;
  plan: CapturePlan;
  targetFrameCount: number;
  rotations: CaptureRotation[];
}

export interface ProjectQualityChecks {
  frameContinuity: QualityCheckState;
  expectedFrameCount: QualityCheckState;
  dimensionsConsistent: QualityCheckState;
  requiredRotationsComplete: QualityCheckState;
  optionalCoverage: QualityCheckState;
  warnings: string[];
  lastValidatedAt?: string;
}

export interface BackgroundRemovalSettings {
  enabled: boolean;
  engine: BackgroundRemovalEngine;
}

export interface ReconstructionModelSelection {
  id: ReconstructionModelId;
  version: string;
  runtime: ReconstructionModelRuntime;
  status: ReconstructionModelStatus;
}

export interface ReconstructionSettings {
  status: ReconstructionStatus;
  engine: ReconstructionEngine;
  model?: ReconstructionModelSelection;
  targetFormats: ExportFormat[];
  notes: string[];
}

export interface ProcessingSettings {
  backgroundRemoval: BackgroundRemovalSettings;
  reconstruction: ReconstructionSettings;
}

export interface CompletedExport {
  format: ExportFormat | "manifest-json";
  createdAt: string;
  uri?: string;
}

export interface ExportSettings {
  packageFormat: "folder" | "zip";
  includeManifest: boolean;
  includeFrames: boolean;
  formats: ExportFormat[];
  completed: CompletedExport[];
}

export interface ForgeScanProjectManifest {
  schemaVersion: ProjectSchemaVersion;
  app: AppMetadata;
  project: ProjectMetadata;
  capture: CaptureSettings;
  quality: ProjectQualityChecks;
  processing: ProcessingSettings;
  exports: ExportSettings;
}

export interface CreateProjectManifestInput {
  title: string;
  targetFrameCount: number;
  includeUnderside: boolean;
  id?: string;
  createdAt?: string;
  appVersion?: string;
}

export interface AddFrameInput {
  uri?: string;
  width?: number;
  height?: number;
  capturedAt?: string;
  camera?: CameraMetadata;
  qualityChecks?: Partial<FrameQualityChecks>;
}

export interface AddVideoInput {
  uri: string;
  durationMs?: number;
  capturedAt?: string;
}

export interface SetReconstructionModelInput {
  engine: ReconstructionEngine;
  model: ReconstructionModelSelection;
  targetFormats?: ExportFormat[];
  note?: string;
}

const rotationTemplates: Record<
  RotationId,
  Omit<CaptureRotation, "frames" | "status">
> = {
  upright: {
    id: "upright",
    label: "Upright 360",
    required: true,
    angleHint: "Object upright on turntable"
  },
  tilted: {
    id: "tilted",
    label: "Tilted 360",
    required: true,
    angleHint: "Object tilted approximately 45 degrees"
  },
  underside: {
    id: "underside",
    label: "Underside / alternate angle",
    required: false,
    angleHint: "Expose bottom or hidden geometry"
  }
};

const defaultExportFormats: ExportFormat[] = [
  "glb",
  "usdz",
  "obj",
  "stl",
  "html",
  "mp4",
  "gif"
];

export function createNewProjectManifest(
  input: CreateProjectManifestInput
): ForgeScanProjectManifest {
  const timestamp = input.createdAt ?? new Date().toISOString();
  const projectId = input.id ?? createProjectId(timestamp);
  const title = input.title.trim() || "Untitled scan";
  const plan: CapturePlan = input.includeUnderside
    ? "three-rotation"
    : "two-rotation";

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    app: {
      name: APP_NAME,
      version: input.appVersion ?? APP_VERSION
    },
    project: {
      id: projectId,
      title,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    capture: {
      mode: "controlled-turntable",
      plan,
      targetFrameCount: input.targetFrameCount,
      rotations: createDefaultRotations()
    },
    quality: {
      frameContinuity: "not-run",
      expectedFrameCount: "not-run",
      dimensionsConsistent: "not-run",
      requiredRotationsComplete: "not-run",
      optionalCoverage: "not-run",
      warnings: []
    },
    processing: {
      backgroundRemoval: {
        enabled: false,
        engine: "none"
      },
      reconstruction: {
        status: "not-started",
        engine: "photogrammetry",
        model: {
          id: DEFAULT_RECONSTRUCTION_MODEL_ID,
          version: DEFAULT_RECONSTRUCTION_MODEL_VERSION,
          runtime: "on-device",
          status: "requires-native-build"
        },
        targetFormats: [...defaultExportFormats],
        notes: [
          "ForgeScan AI Mobile v1 is selected for on-device reconstruction planning.",
          "Reconstruction runs after capture data passes project validation."
        ]
      }
    },
    exports: {
      packageFormat: "folder",
      includeManifest: true,
      includeFrames: true,
      formats: [...defaultExportFormats],
      completed: []
    }
  };
}

export function updateProjectTimestamp(
  manifest: ForgeScanProjectManifest,
  updatedAt = new Date().toISOString()
): ForgeScanProjectManifest {
  return {
    ...manifest,
    project: {
      ...manifest.project,
      updatedAt
    }
  };
}

export function addFrameToRotation(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId,
  frameInput: AddFrameInput = {}
): ForgeScanProjectManifest {
  const updatedRotations: CaptureRotation[] = manifest.capture.rotations.map((rotation) => {
    if (rotation.id !== rotationId) {
      return rotation;
    }

    const nextIndex = getNextFrameIndex(rotation.frames);
    const filename = createFrameFilename(nextIndex);
    const frame: CapturedFrame = {
      index: nextIndex,
      filename,
      uri: frameInput.uri ?? `project://${manifest.project.id}/rotations/${rotationId}/${filename}`,
      capturedAt: frameInput.capturedAt ?? new Date().toISOString(),
      qualityChecks: {
        blur: frameInput.qualityChecks?.blur ?? "not-run",
        exposure: frameInput.qualityChecks?.exposure ?? "not-run",
        centered: frameInput.qualityChecks?.centered ?? "not-run",
        notes: frameInput.qualityChecks?.notes ?? []
      },
      ...(frameInput.width !== undefined ? { width: frameInput.width } : {}),
      ...(frameInput.height !== undefined ? { height: frameInput.height } : {}),
      ...(frameInput.camera !== undefined ? { camera: frameInput.camera } : {})
    };

    return {
      ...rotation,
      status: rotation.status === "complete" ? "complete" : "capturing",
      frames: [...rotation.frames, frame]
    };
  });

  return updateProjectTimestamp({
    ...manifest,
    capture: {
      ...manifest.capture,
      rotations: updatedRotations
    }
  });
}

export function removeLastFrameFromRotation(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId
): ForgeScanProjectManifest {
  const updatedRotations: CaptureRotation[] = manifest.capture.rotations.map((rotation) => {
    if (rotation.id !== rotationId) {
      return rotation;
    }

    return {
      ...rotation,
      frames: rotation.frames.slice(0, -1),
      status: rotation.frames.length <= 1 ? "capturing" : rotation.status
    };
  });

  return updateProjectTimestamp({
    ...manifest,
    capture: {
      ...manifest.capture,
      rotations: updatedRotations
    }
  });
}

export function addVideoToRotation(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId,
  videoInput: AddVideoInput
): ForgeScanProjectManifest {
  const updatedRotations: CaptureRotation[] = manifest.capture.rotations.map((rotation) => {
    if (rotation.id !== rotationId) {
      return rotation;
    }

    const existingVideos = rotation.videos ?? [];
    const nextIndex = getNextVideoIndex(existingVideos);
    const video: CapturedVideo = {
      index: nextIndex,
      filename: createVideoFilename(nextIndex),
      uri: videoInput.uri,
      capturedAt: videoInput.capturedAt ?? new Date().toISOString(),
      ...(videoInput.durationMs !== undefined
        ? { durationMs: videoInput.durationMs }
        : {})
    };

    return {
      ...rotation,
      status: rotation.status === "complete" ? "complete" : "capturing",
      videos: [...existingVideos, video]
    };
  });

  return updateProjectTimestamp({
    ...manifest,
    capture: {
      ...manifest.capture,
      rotations: updatedRotations
    }
  });
}

export function removeLastVideoFromRotation(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId
): ForgeScanProjectManifest {
  const updatedRotations: CaptureRotation[] = manifest.capture.rotations.map((rotation) => {
    if (rotation.id !== rotationId) {
      return rotation;
    }

    return {
      ...rotation,
      videos: (rotation.videos ?? []).slice(0, -1)
    };
  });

  return updateProjectTimestamp({
    ...manifest,
    capture: {
      ...manifest.capture,
      rotations: updatedRotations
    }
  });
}

export function setReconstructionModel(
  manifest: ForgeScanProjectManifest,
  input: SetReconstructionModelInput
): ForgeScanProjectManifest {
  const nextNotes = input.note
    ? [
        input.note,
        ...manifest.processing.reconstruction.notes.filter(
          (note) => note !== input.note
        )
      ]
    : manifest.processing.reconstruction.notes;

  return updateProjectTimestamp({
    ...manifest,
    processing: {
      ...manifest.processing,
      reconstruction: {
        ...manifest.processing.reconstruction,
        engine: input.engine,
        model: input.model,
        status:
          manifest.processing.reconstruction.status === "not-started"
            ? "planned"
            : manifest.processing.reconstruction.status,
        targetFormats: [
          ...(input.targetFormats ??
            manifest.processing.reconstruction.targetFormats)
        ],
        notes: nextNotes
      }
    }
  });
}

export function markRotationComplete(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId
): ForgeScanProjectManifest {
  return setRotationStatus(manifest, rotationId, "complete");
}

export function setRotationStatus(
  manifest: ForgeScanProjectManifest,
  rotationId: RotationId,
  status: RotationStatus
): ForgeScanProjectManifest {
  const updatedRotations = manifest.capture.rotations.map((rotation) =>
    rotation.id === rotationId ? { ...rotation, status } : rotation
  );

  return updateProjectTimestamp({
    ...manifest,
    capture: {
      ...manifest.capture,
      rotations: updatedRotations
    }
  });
}

export function createFrameFilename(index: number): string {
  return `frame_${String(index).padStart(3, "0")}.jpg`;
}

export function createVideoFilename(index: number): string {
  return `video_${String(index).padStart(3, "0")}.mp4`;
}

function createDefaultRotations(): CaptureRotation[] {
  return [
    createRotation("upright"),
    createRotation("tilted"),
    createRotation("underside")
  ];
}

function createRotation(id: RotationId): CaptureRotation {
  return {
    ...rotationTemplates[id],
    status: "pending",
    frames: [],
    videos: []
  };
}

function getNextFrameIndex(frames: CapturedFrame[]): number {
  if (frames.length === 0) {
    return 1;
  }

  return Math.max(...frames.map((frame) => frame.index)) + 1;
}

function getNextVideoIndex(videos: CapturedVideo[]): number {
  if (videos.length === 0) {
    return 1;
  }

  return Math.max(...videos.map((video) => video.index)) + 1;
}

function createProjectId(timestamp: string): string {
  const randomSegment = Math.random().toString(36).slice(2, 8);
  const compactTimestamp = timestamp.replace(/[^0-9]/g, "").slice(0, 14);
  return `forgescan_${compactTimestamp}_${randomSegment}`;
}
