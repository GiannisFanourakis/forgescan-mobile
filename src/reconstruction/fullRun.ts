import {
  CapturedFrame,
  ExportFormat,
  ForgeScanProjectManifest,
  RotationId
} from "../core/manifest";
import { createReconstructionPlan } from "../core/reconstructionPlan";
import { validateProjectForReconstruction } from "../core/frameValidation";
import {
  writeProjectExportFile,
  writeProjectFile
} from "../storage/projectStorage";
import {
  createRawMaskPath,
  createRefinedMaskPath
} from "../segmentation/maskPaths";
import { getSelectedReconstructionModel } from "./modelRegistry";

export type FullRunStageId =
  | "background-segmentation"
  | "frame-quality"
  | "pose-estimation"
  | "rotation-alignment"
  | "reconstruction"
  | "cleanup"
  | "model-export"
  | "preview-export";

export type FullRunStageStatus =
  | "pending"
  | "running"
  | "complete"
  | "warning"
  | "blocked";

export interface FullRunStageDefinition {
  id: FullRunStageId;
  label: string;
  description: string;
}

export interface FullRunArtifact {
  filename: string;
  uri: string;
  format: ExportFormat | "json" | "ply" | "png";
  kind: "stage-data" | "model" | "viewer" | "preview" | "report";
  bytes: number;
}

export interface FullRunStageResult extends FullRunStageDefinition {
  status: FullRunStageStatus;
  mode: "device-test" | "native-ai-target";
  startedAt?: string;
  completedAt?: string;
  detail: string;
  inputs: string[];
  outputs: string[];
  artifacts: FullRunArtifact[];
  warnings: string[];
  metrics: Record<string, number | string | boolean>;
}

export interface FullReconstructionRunReport {
  projectId: string;
  projectTitle: string;
  startedAt: string;
  completedAt: string;
  status: "complete" | "warning" | "blocked";
  implementation: "expo-device-test";
  summary: string;
  aiModel: {
    id: string;
    label: string;
    version: string;
    engine: string;
    runtime: string;
  };
  validation: ReturnType<typeof validateProjectForReconstruction>;
  reconstructionPlan: ReturnType<typeof createReconstructionPlan>;
  stages: FullRunStageResult[];
  artifacts: FullRunArtifact[];
}

interface FrameContext {
  rotationId: RotationId;
  rotationLabel: string;
  frame: CapturedFrame;
  frameOrdinal: number;
  rotationFrameCount: number;
}

interface StageContext {
  manifest: ForgeScanProjectManifest;
  frames: FrameContext[];
  artifacts: FullRunArtifact[];
}

const fallbackMaskPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

export const fullRunStageDefinitions: FullRunStageDefinition[] = [
  {
    id: "background-segmentation",
    label: "Background removal / segmentation",
    description: "Create object masks for every captured frame."
  },
  {
    id: "frame-quality",
    label: "Frame quality scoring",
    description: "Score blur, exposure, centering, dimensions, and continuity."
  },
  {
    id: "pose-estimation",
    label: "Pose estimation",
    description: "Estimate camera orbit poses from ordered rotation frames."
  },
  {
    id: "rotation-alignment",
    label: "Multi-rotation alignment",
    description: "Align upright, tilted, and underside rotations."
  },
  {
    id: "reconstruction",
    label: "Photogrammetry / Gaussian Splatting reconstruction",
    description: "Generate a test mesh and Gaussian splat cloud."
  },
  {
    id: "cleanup",
    label: "AI cleanup / hole filling / texture repair",
    description: "Run the cleanup pass and record repair operations."
  },
  {
    id: "model-export",
    label: "Export GLB / USDZ / OBJ / STL",
    description: "Write model artifacts into the local export folder."
  },
  {
    id: "preview-export",
    label: "Export HTML / MP4 / GIF previews",
    description: "Write preview artifacts for inspection and sharing."
  }
];

export function createInitialFullRunStages(): FullRunStageResult[] {
  return fullRunStageDefinitions.map((stage) => ({
    ...stage,
    status: "pending",
    mode: "device-test",
    detail: "Waiting to run.",
    inputs: [],
    outputs: [],
    artifacts: [],
    warnings: [],
    metrics: {}
  }));
}

export async function runFullReconstructionTest(
  manifest: ForgeScanProjectManifest,
  onStageUpdate?: (stage: FullRunStageResult) => void
): Promise<FullReconstructionRunReport> {
  const startedAt = new Date().toISOString();
  const validation = validateProjectForReconstruction(manifest);
  const reconstructionPlan = createReconstructionPlan(manifest);
  const model = getSelectedReconstructionModel(manifest);
  const context: StageContext = {
    manifest,
    frames: collectFrames(manifest),
    artifacts: []
  };
  const stages: FullRunStageResult[] = [];

  for (const definition of fullRunStageDefinitions) {
    const runningStage = createRunningStage(definition);
    onStageUpdate?.(runningStage);
    await pause(80);

    const completedStage = runStage(definition.id, context, runningStage);
    stages.push(completedStage);
    onStageUpdate?.(completedStage);
    await pause(80);
  }

  const completedAt = new Date().toISOString();
  const status = stages.some((stage) => stage.status === "blocked")
    ? "blocked"
    : stages.some((stage) => stage.status === "warning")
      ? "warning"
      : "complete";
  const reportBase: FullReconstructionRunReport = {
    projectId: manifest.project.id,
    projectTitle: manifest.project.title,
    startedAt,
    completedAt,
    status,
    implementation: "expo-device-test",
    summary:
      "Full reconstruction test completed inside Expo with generated local artifacts. Native AI modules can replace the test implementations without changing this app flow.",
    aiModel: {
      id: model.id,
      label: model.label,
      version: model.version,
      engine: model.engine,
      runtime: model.runtime
    },
    validation,
    reconstructionPlan,
    stages,
    artifacts: context.artifacts
  };
  const reportArtifact = writeArtifact(
    manifest,
    "full-run-report.json",
    JSON.stringify(reportBase, null, 2),
    "json",
    "report"
  );
  const finalReport = {
    ...reportBase,
    artifacts: [...context.artifacts, reportArtifact]
  };

  writeProjectExportFile(
    manifest,
    "full-run-report.json",
    JSON.stringify(finalReport, null, 2)
  );

  return finalReport;
}

function runStage(
  id: FullRunStageId,
  context: StageContext,
  runningStage: FullRunStageResult
): FullRunStageResult {
  switch (id) {
    case "background-segmentation":
      return runSegmentationStage(context, runningStage);
    case "frame-quality":
      return runFrameQualityStage(context, runningStage);
    case "pose-estimation":
      return runPoseEstimationStage(context, runningStage);
    case "rotation-alignment":
      return runRotationAlignmentStage(context, runningStage);
    case "reconstruction":
      return runReconstructionStage(context, runningStage);
    case "cleanup":
      return runCleanupStage(context, runningStage);
    case "model-export":
      return runModelExportStage(context, runningStage);
    case "preview-export":
      return runPreviewExportStage(context, runningStage);
  }
}

function runSegmentationStage(
  context: StageContext,
  stage: FullRunStageResult
): FullRunStageResult {
  const warnings = context.frames.length === 0 ? ["No frames captured."] : [];
  const masks = context.frames.map(({ frame, rotationId }) => ({
    rotationId,
    frameIndex: frame.index,
    sourceUri: frame.uri,
    rawMaskPath: createRawMaskPath(rotationId, frame.index),
    refinedMaskPath: createRefinedMaskPath(rotationId, frame.index),
    method: "test-oval-foreground-mask",
    confidence: estimateSegmentationConfidence(frame),
    normalizedBounds: {
      x: 0.12,
      y: 0.1,
      width: 0.76,
      height: 0.8
    }
  }));
  const maskArtifacts = masks.flatMap((mask) => [
    writeProjectArtifact(
      context.manifest,
      mask.rawMaskPath,
      fallbackMaskPng,
      "png",
      "stage-data"
    ),
    writeProjectArtifact(
      context.manifest,
      mask.refinedMaskPath,
      fallbackMaskPng,
      "png",
      "stage-data"
    )
  ]);
  const artifact = writeArtifact(
    context.manifest,
    "segmentation.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        implementation: "expo-device-test",
        maskCount: masks.length,
        masks
      },
      null,
      2
    ),
    "json",
    "stage-data"
  );

  context.artifacts.push(...maskArtifacts, artifact);
  return completeStage(stage, {
    status: warnings.length > 0 ? "warning" : "complete",
    detail:
      "Generated test foreground masks for captured frames. Native segmentation will replace this with real per-pixel masks.",
    inputs: ["captured frame files"],
    outputs: ["masks/raw/{rotation}/frame_001.png", "masks/refined/{rotation}/frame_001.png", "segmentation.json"],
    artifacts: [...maskArtifacts, artifact],
    warnings,
    metrics: {
      framesSegmented: masks.length
    }
  });
}

function runFrameQualityStage(
  context: StageContext,
  stage: FullRunStageResult
): FullRunStageResult {
  const scores = context.frames.map(({ frame, rotationId }) => ({
    rotationId,
    frameIndex: frame.index,
    filename: frame.filename,
    ...scoreFrame(frame)
  }));
  const averageScore =
    scores.length === 0
      ? 0
      : Math.round(
          scores.reduce((sum, score) => sum + score.score, 0) / scores.length
        );
  const warnings =
    scores.length === 0
      ? ["No captured frames were available for scoring."]
      : scores
          .filter((score) => score.score < 70)
          .map(
            (score) =>
              `${score.rotationId} frame ${score.frameIndex} scored ${score.score}.`
          );
  const artifact = writeArtifact(
    context.manifest,
    "frame-quality.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        averageScore,
        scores
      },
      null,
      2
    ),
    "json",
    "stage-data"
  );

  context.artifacts.push(artifact);
  return completeStage(stage, {
    status: warnings.length > 0 ? "warning" : "complete",
    detail:
      "Scored frame continuity, known dimensions, blur flags, exposure flags, and centering flags.",
    inputs: ["manifest frame metadata"],
    outputs: ["frame-quality.json"],
    artifacts: [artifact],
    warnings,
    metrics: {
      averageScore,
      framesScored: scores.length
    }
  });
}

function runPoseEstimationStage(
  context: StageContext,
  stage: FullRunStageResult
): FullRunStageResult {
  const poses = context.frames.map((frameContext) =>
    createSyntheticPose(frameContext)
  );
  const artifact = writeArtifact(
    context.manifest,
    "camera-poses.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        implementation: "ordered-turntable-orbit-test",
        poses
      },
      null,
      2
    ),
    "json",
    "stage-data"
  );

  context.artifacts.push(artifact);
  return completeStage(stage, {
    status: poses.length === 0 ? "warning" : "complete",
    detail:
      "Estimated synthetic orbit poses from frame order. Native ARCore/ARKit pose assistance can replace this stage.",
    inputs: ["ordered frames", "capture rotations"],
    outputs: ["camera-poses.json"],
    artifacts: [artifact],
    warnings:
      poses.length === 0 ? ["No frames were available for pose estimation."] : [],
    metrics: {
      posesEstimated: poses.length
    }
  });
}

function runRotationAlignmentStage(
  context: StageContext,
  stage: FullRunStageResult
): FullRunStageResult {
  const rotations = context.manifest.capture.rotations.map((rotation) => ({
    rotationId: rotation.id,
    label: rotation.label,
    status: rotation.status,
    frameCount: rotation.frames.length,
    transform: getRotationTransform(rotation.id),
    alignmentConfidence:
      rotation.status === "complete" ? 0.88 : rotation.required ? 0.45 : 0.62
  }));
  const alignmentWarnings = context.manifest.capture.rotations
    .filter((rotation) => rotation.status !== "complete")
    .map((rotation) => `${rotation.label} is not marked complete.`);
  const artifact = writeArtifact(
    context.manifest,
    "rotation-alignment.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        alignmentSpace: "object-centered-test",
        rotations
      },
      null,
      2
    ),
    "json",
    "stage-data"
  );

  context.artifacts.push(artifact);
  return completeStage(stage, {
    status: alignmentWarnings.length > 0 ? "warning" : "complete",
    detail:
      "Aligned upright, tilted, and underside capture sets into one object-centered frame.",
    inputs: ["camera-poses.json", "manifest rotations"],
    outputs: ["rotation-alignment.json"],
    artifacts: [artifact],
    warnings: alignmentWarnings,
    metrics: {
      rotationsAligned: rotations.length,
      warnings: alignmentWarnings.length
    }
  });
}

function runReconstructionStage(
  context: StageContext,
  stage: FullRunStageResult
): FullRunStageResult {
  const model = getSelectedReconstructionModel(context.manifest);
  const plyArtifact = writeArtifact(
    context.manifest,
    "gaussian-splats.ply",
    createGaussianSplatPly(context.frames),
    "ply",
    "stage-data"
  );
  const summaryArtifact = writeArtifact(
    context.manifest,
    "reconstruction-summary.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: model.label,
        engine: model.engine,
        implementation: "expo-device-test",
        gaussianSplatCount: Math.max(context.frames.length * 8, 32),
        meshPrimitive: "tetrahedral-test-mesh",
        note:
          "This validates the app reconstruction path. Native photogrammetry or Gaussian optimization replaces the test primitive."
      },
      null,
      2
    ),
    "json",
    "stage-data"
  );

  context.artifacts.push(plyArtifact, summaryArtifact);
  return completeStage(stage, {
    status: "complete",
    detail:
      "Generated a Gaussian splat cloud and test mesh primitive for the reconstruction path.",
    inputs: ["rotation-alignment.json", "segmentation.json"],
    outputs: ["gaussian-splats.ply", "reconstruction-summary.json"],
    artifacts: [plyArtifact, summaryArtifact],
    warnings: [
      "Native Gaussian optimization and dense photogrammetry are represented by test artifacts in Expo."
    ],
    metrics: {
      splats: Math.max(context.frames.length * 8, 32),
      engine: model.engine
    }
  });
}

function runCleanupStage(
  context: StageContext,
  stage: FullRunStageResult
): FullRunStageResult {
  const report = {
    generatedAt: new Date().toISOString(),
    implementation: "expo-device-test",
    operations: [
      "hole-fill-pass",
      "floating-fragment-removal",
      "texture-seam-smoothing",
      "normal-recalculation"
    ],
    repairedHoles: Math.max(1, Math.round(context.frames.length / 48)),
    texturePatches: Math.max(1, Math.round(context.frames.length / 32)),
    note:
      "AI cleanup is represented as deterministic repair metadata until the native model is connected."
  };
  const artifact = writeArtifact(
    context.manifest,
    "cleanup-report.json",
    JSON.stringify(report, null, 2),
    "json",
    "stage-data"
  );

  context.artifacts.push(artifact);
  return completeStage(stage, {
    status: "complete",
    detail:
      "Created cleanup, hole filling, texture repair, and normal recalculation metadata.",
    inputs: ["reconstruction-summary.json"],
    outputs: ["cleanup-report.json"],
    artifacts: [artifact],
    warnings: [],
    metrics: {
      repairedHoles: report.repairedHoles,
      texturePatches: report.texturePatches
    }
  });
}

function runModelExportStage(
  context: StageContext,
  stage: FullRunStageResult
): FullRunStageResult {
  const artifacts = [
    writeArtifact(context.manifest, "model.glb", createGlb(), "glb", "model"),
    writeArtifact(context.manifest, "model.usdz", createUsdz(), "usdz", "model"),
    writeArtifact(context.manifest, "model.obj", createObj(), "obj", "model"),
    writeArtifact(context.manifest, "model.stl", createStl(), "stl", "model")
  ];

  context.artifacts.push(...artifacts);
  return completeStage(stage, {
    status: "complete",
    detail:
      "Exported the test reconstruction to GLB, USDZ, OBJ, and STL files.",
    inputs: ["cleanup-report.json", "reconstruction-summary.json"],
    outputs: artifacts.map((artifact) => artifact.filename),
    artifacts,
    warnings: [
      "GLB, OBJ, and STL are lightweight test geometry. USDZ is a basic uncompressed USD package for export-path testing."
    ],
    metrics: {
      modelExports: artifacts.length
    }
  });
}

function runPreviewExportStage(
  context: StageContext,
  stage: FullRunStageResult
): FullRunStageResult {
  const artifacts = [
    writeArtifact(
      context.manifest,
      "viewer.html",
      createViewerHtml(context.manifest),
      "html",
      "viewer"
    ),
    writeArtifact(
      context.manifest,
      "preview.mp4",
      createMp4Stub(),
      "mp4",
      "preview"
    ),
    writeArtifact(
      context.manifest,
      "preview.gif",
      createGifPreview(),
      "gif",
      "preview"
    )
  ];

  context.artifacts.push(...artifacts);
  return completeStage(stage, {
    status: "complete",
    detail:
      "Exported preview viewer files. The MP4 validates file generation; native rendering will replace it with a real turntable render.",
    inputs: ["model.glb", "model.obj"],
    outputs: artifacts.map((artifact) => artifact.filename),
    artifacts,
    warnings: ["MP4 preview is an empty container stub in the Expo test run."],
    metrics: {
      previewExports: artifacts.length
    }
  });
}

function createRunningStage(
  definition: FullRunStageDefinition
): FullRunStageResult {
  return {
    ...definition,
    status: "running",
    mode: "device-test",
    startedAt: new Date().toISOString(),
    detail: "Running.",
    inputs: [],
    outputs: [],
    artifacts: [],
    warnings: [],
    metrics: {}
  };
}

function completeStage(
  stage: FullRunStageResult,
  patch: Omit<
    FullRunStageResult,
    | "id"
    | "label"
    | "description"
    | "mode"
    | "startedAt"
    | "completedAt"
  >
): FullRunStageResult {
  return {
    ...stage,
    ...patch,
    completedAt: new Date().toISOString()
  };
}

function collectFrames(manifest: ForgeScanProjectManifest): FrameContext[] {
  return manifest.capture.rotations.flatMap((rotation) =>
    rotation.frames.map((frame, index) => ({
      rotationId: rotation.id,
      rotationLabel: rotation.label,
      frame,
      frameOrdinal: index + 1,
      rotationFrameCount: rotation.frames.length
    }))
  );
}

function writeArtifact(
  manifest: ForgeScanProjectManifest,
  filename: string,
  content: string | Uint8Array,
  format: FullRunArtifact["format"],
  kind: FullRunArtifact["kind"]
): FullRunArtifact {
  const uri = writeProjectExportFile(manifest, filename, content);
  return {
    filename,
    uri,
    format,
    kind,
    bytes: typeof content === "string" ? content.length : content.byteLength
  };
}

function writeProjectArtifact(
  manifest: ForgeScanProjectManifest,
  relativePath: string,
  content: string | Uint8Array,
  format: FullRunArtifact["format"],
  kind: FullRunArtifact["kind"]
): FullRunArtifact {
  const uri = writeProjectFile(manifest, relativePath, content);
  return {
    filename: relativePath,
    uri,
    format,
    kind,
    bytes: typeof content === "string" ? content.length : content.byteLength
  };
}

function scoreFrame(frame: CapturedFrame): {
  score: number;
  grade: "pass" | "warning" | "fail";
  notes: string[];
} {
  const notes: string[] = [];
  let score = 100;

  if (frame.width === undefined || frame.height === undefined) {
    score -= 5;
    notes.push("Image dimensions unavailable.");
  }

  for (const [key, value] of Object.entries(frame.qualityChecks)) {
    if (key === "notes") {
      continue;
    }

    if (value === "fail") {
      score -= 25;
      notes.push(`${key} failed.`);
    } else if (value === "warning") {
      score -= 10;
      notes.push(`${key} warning.`);
    }
  }

  score = Math.max(0, score);
  return {
    score,
    grade: score >= 80 ? "pass" : score >= 60 ? "warning" : "fail",
    notes
  };
}

function estimateSegmentationConfidence(frame: CapturedFrame): number {
  if (frame.width !== undefined && frame.height !== undefined) {
    return 0.84;
  }

  return 0.72;
}

function createSyntheticPose(context: FrameContext): {
  rotationId: RotationId;
  frameIndex: number;
  yawDegrees: number;
  tiltDegrees: number;
  position: [number, number, number];
  lookAt: [number, number, number];
  confidence: number;
} {
  const denominator = Math.max(context.rotationFrameCount, 1);
  const yawDegrees = ((context.frameOrdinal - 1) / denominator) * 360;
  const yawRadians = toRadians(yawDegrees);
  const tiltDegrees = getRotationTilt(context.rotationId);
  const radius = 1.35;
  return {
    rotationId: context.rotationId,
    frameIndex: context.frame.index,
    yawDegrees: round(yawDegrees),
    tiltDegrees,
    position: [
      round(Math.sin(yawRadians) * radius),
      round(Math.sin(toRadians(tiltDegrees)) * 0.55),
      round(Math.cos(yawRadians) * radius)
    ],
    lookAt: [0, 0, 0],
    confidence: context.rotationFrameCount > 0 ? 0.82 : 0.35
  };
}

function getRotationTilt(rotationId: RotationId): number {
  switch (rotationId) {
    case "upright":
      return 0;
    case "tilted":
      return 45;
    case "underside":
      return 160;
  }
}

function getRotationTransform(rotationId: RotationId): number[] {
  switch (rotationId) {
    case "upright":
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    case "tilted":
      return [
        1, 0, 0, 0, 0, 0.707, -0.707, 0, 0, 0.707, 0.707, 0, 0, 0, 0, 1
      ];
    case "underside":
      return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
  }
}

function createGaussianSplatPly(frames: FrameContext[]): string {
  const count = Math.max(frames.length * 8, 32);
  const lines = [
    "ply",
    "format ascii 1.0",
    "comment ForgeScan Expo test Gaussian splat cloud",
    `element vertex ${count}`,
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    "property float scale",
    "end_header"
  ];

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const band = (index % 8) / 8;
    const x = round(Math.cos(angle) * (0.42 + band * 0.12));
    const y = round((band - 0.5) * 0.75);
    const z = round(Math.sin(angle) * (0.42 + band * 0.12));
    lines.push(`${x} ${y} ${z} 18 100 102 0.018`);
  }

  return `${lines.join("\n")}\n`;
}

function createObj(): string {
  return [
    "# ForgeScan test reconstruction OBJ",
    "o ForgeScan_Test_Model",
    "v 0 0.65 0",
    "v -0.55 -0.35 0.45",
    "v 0.55 -0.35 0.45",
    "v 0 -0.35 -0.55",
    "f 1 2 3",
    "f 1 3 4",
    "f 1 4 2",
    "f 2 4 3",
    ""
  ].join("\n");
}

function createStl(): string {
  return [
    "solid ForgeScan_Test_Model",
    createStlFacet([0, 0.65, 0], [-0.55, -0.35, 0.45], [0.55, -0.35, 0.45]),
    createStlFacet([0, 0.65, 0], [0.55, -0.35, 0.45], [0, -0.35, -0.55]),
    createStlFacet([0, 0.65, 0], [0, -0.35, -0.55], [-0.55, -0.35, 0.45]),
    createStlFacet([-0.55, -0.35, 0.45], [0, -0.35, -0.55], [0.55, -0.35, 0.45]),
    "endsolid ForgeScan_Test_Model",
    ""
  ].join("\n");
}

function createStlFacet(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
): string {
  return [
    "  facet normal 0 0 0",
    "    outer loop",
    `      vertex ${a.join(" ")}`,
    `      vertex ${b.join(" ")}`,
    `      vertex ${c.join(" ")}`,
    "    endloop",
    "  endfacet"
  ].join("\n");
}

function createGlb(): Uint8Array {
  const positions = floatsToBytes([
    0, 0.65, 0, -0.55, -0.35, 0.45, 0.55, -0.35, 0.45, 0, -0.35, -0.55
  ]);
  const indices = uint16ToBytes([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]);
  const binary = concatBytes([positions, indices]);
  const gltf = {
    asset: {
      version: "2.0",
      generator: "ForgeScan Expo full-run test"
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "ForgeScan_Test_Model" }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            mode: 4,
            material: 0
          }
        ]
      }
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.07, 0.39, 0.4, 1],
          metallicFactor: 0.05,
          roughnessFactor: 0.45
        }
      }
    ],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positions.byteLength,
        target: 34962
      },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: indices.byteLength,
        target: 34963
      }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: "VEC3",
        min: [-0.55, -0.35, -0.55],
        max: [0.55, 0.65, 0.45]
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 12,
        type: "SCALAR"
      }
    ]
  };
  const json = encodeAscii(JSON.stringify(gltf));
  const jsonPadded = padBytes(json, 0x20);
  const binaryPadded = padBytes(binary, 0);
  const totalLength = 12 + 8 + jsonPadded.byteLength + 8 + binaryPadded.byteLength;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  let offset = 0;

  view.setUint32(offset, 0x46546c67, true);
  offset += 4;
  view.setUint32(offset, 2, true);
  offset += 4;
  view.setUint32(offset, totalLength, true);
  offset += 4;
  view.setUint32(offset, jsonPadded.byteLength, true);
  offset += 4;
  view.setUint32(offset, 0x4e4f534a, true);
  offset += 4;
  output.set(jsonPadded, offset);
  offset += jsonPadded.byteLength;
  view.setUint32(offset, binaryPadded.byteLength, true);
  offset += 4;
  view.setUint32(offset, 0x004e4942, true);
  offset += 4;
  output.set(binaryPadded, offset);

  return output;
}

function createUsdz(): Uint8Array {
  const usda = [
    "#usda 1.0",
    "(",
    '  defaultPrim = "ForgeScanModel"',
    ")",
    "",
    'def Xform "ForgeScanModel"',
    "{",
    '  def Mesh "TestMesh"',
    "  {",
    "    int[] faceVertexCounts = [3, 3, 3, 3]",
    "    int[] faceVertexIndices = [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]",
    "    point3f[] points = [(0, 0.65, 0), (-0.55, -0.35, 0.45), (0.55, -0.35, 0.45), (0, -0.35, -0.55)]",
    "  }",
    "}",
    ""
  ].join("\n");

  return createStoreZip([
    {
      name: "model.usda",
      data: encodeAscii(usda)
    }
  ]);
}

function createViewerHtml(manifest: ForgeScanProjectManifest): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(manifest.project.title)} ForgeScan Preview</title>`,
    "<style>",
    "body{margin:0;background:#101817;color:#f7f7f4;font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:grid;min-height:100vh;place-items:center}",
    ".stage{width:min(88vw,720px);aspect-ratio:1.4;border:1px solid rgba(255,255,255,.18);position:relative;overflow:hidden;background:radial-gradient(circle at 50% 42%,#2f7d55 0 4%,transparent 5%),linear-gradient(135deg,#17211f,#0f1514)}",
    ".ring{position:absolute;inset:18%;border:2px solid rgba(255,255,255,.2);border-radius:50%;animation:spin 7s linear infinite}",
    ".model{position:absolute;left:50%;top:48%;width:120px;height:120px;transform:translate(-50%,-50%) rotate(45deg);background:#116466;clip-path:polygon(50% 0,100% 72%,50% 100%,0 72%);box-shadow:0 24px 80px rgba(0,0,0,.45)}",
    ".label{position:absolute;left:24px;bottom:22px;font-weight:800;letter-spacing:0}",
    "@keyframes spin{to{transform:rotate(360deg)}}",
    "</style>",
    "</head>",
    "<body>",
    '<main class="stage">',
    '<div class="ring"></div>',
    '<div class="model"></div>',
    `<div class="label">${escapeHtml(manifest.project.title)} / ForgeScan test preview</div>`,
    "</main>",
    "</body>",
    "</html>"
  ].join("");
}

function createGifPreview(): Uint8Array {
  return new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
    0x00, 0x11, 0x64, 0x66, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b
  ]);
}

function createMp4Stub(): Uint8Array {
  return concatBytes([
    createMp4Box("ftyp", concatBytes([encodeAscii("isom"), uint32ToBytes(1), encodeAscii("isomiso2mp41")])),
    createMp4Box("free", encodeAscii("ForgeScan Expo preview export test")),
    createMp4Box("mdat", new Uint8Array()),
    createMp4Box("moov", new Uint8Array())
  ]);
}

function createMp4Box(type: string, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(8 + payload.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, output.byteLength, false);
  output.set(encodeAscii(type), 4);
  output.set(payload, 8);
  return output;
}

function createStoreZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encodeAscii(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.byteLength);
    const localView = new DataView(local.buffer);
    const localOffset = offset;

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.byteLength, true);
    localView.setUint32(22, entry.data.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    localParts.push(local, entry.data);
    offset += local.byteLength + entry.data.byteLength;

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.byteLength, true);
    centralView.setUint32(24, entry.data.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
  }

  const centralDirectory = concatBytes(centralParts);
  const centralStart = offset;
  offset += centralDirectory.byteLength;
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralDirectory.byteLength, true);
  eocdView.setUint32(16, centralStart, true);

  return concatBytes([...localParts, centralDirectory, eocd]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function floatsToBytes(values: number[]): Uint8Array {
  const output = new Uint8Array(values.length * 4);
  const view = new DataView(output.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return output;
}

function uint16ToBytes(values: number[]): Uint8Array {
  const output = new Uint8Array(values.length * 2);
  const view = new DataView(output.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return output;
}

function uint32ToBytes(value: number): Uint8Array {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value, false);
  return output;
}

function encodeAscii(value: string): Uint8Array {
  const output = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    output[index] = value.charCodeAt(index) & 0xff;
  }
  return output;
}

function padBytes(bytes: Uint8Array, padValue: number): Uint8Array {
  const paddedLength = Math.ceil(bytes.byteLength / 4) * 4;
  const output = new Uint8Array(paddedLength);
  output.fill(padValue);
  output.set(bytes, 0);
  return output;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
