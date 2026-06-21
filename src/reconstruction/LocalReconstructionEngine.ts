import { createExpectedMaskArtifacts } from "../core/segmentationPlan";
import { ForgeScanProjectManifest, RotationId } from "../core/manifest";
import { writeProjectFile } from "../storage/projectStorage";
import { ReconstructionEngine } from "./ReconstructionEngine";
import {
  ReconstructionArtifact,
  ReconstructionJob,
  ReconstructionRunResult
} from "./ReconstructionTypes";

export class LocalReconstructionEngine implements ReconstructionEngine {
  async runReconstruction(
    manifest: ForgeScanProjectManifest
  ): Promise<ReconstructionRunResult> {
    const warnings = [
      "True mobile photogrammetry is not available in Expo Go; generated rough proxy model and reconstruction package instead."
    ];
    const artifacts: ReconstructionArtifact[] = [];
    const cameraFrames = manifest.capture.rotations.flatMap((rotation) =>
      rotation.frames.map((frame, index) => ({
        rotationId: rotation.id,
        frameIndex: frame.index,
        frameOrder: index + 1,
        filename: frame.filename,
        uri: frame.uri,
        assumedPose: createAssumedPose(rotation.id, index, rotation.frames.length)
      }))
    );
    const maskArtifacts = createExpectedMaskArtifacts(manifest);

    artifacts.push(
      writeJsonArtifact(manifest, "reconstruction/reconstruction-input.json", {
        projectId: manifest.project.id,
        projectTitle: manifest.project.title,
        createdAt: new Date().toISOString(),
        rotations: manifest.capture.rotations.map((rotation) => ({
          id: rotation.id,
          label: rotation.label,
          frameCount: rotation.frames.length,
          status: rotation.status
        }))
      }),
      writeJsonArtifact(manifest, "reconstruction/camera-frames.json", {
        frames: cameraFrames
      }),
      writeJsonArtifact(manifest, "reconstruction/masks.json", {
        masks: maskArtifacts
      }),
      writeJsonArtifact(manifest, "reconstruction/alignment-input.json", {
        alignmentSpace: "object-centered-turntable",
        rotations: manifest.capture.rotations.map((rotation) => ({
          rotationId: rotation.id,
          transform: getRotationTransform(rotation.id),
          frameCount: rotation.frames.length
        }))
      })
    );

    artifacts.push(
      writeTextArtifact(
        manifest,
        "reconstruction/rough-model.obj",
        createRoughObj(),
        "obj",
        "model"
      ),
      writeTextArtifact(
        manifest,
        "reconstruction/point-cloud.ply",
        createPointCloudPly(cameraFrames.length),
        "ply",
        "point-cloud"
      ),
      writeTextArtifact(
        manifest,
        "fallback/model.obj",
        createRoughObj(),
        "obj",
        "model"
      )
    );

    const job: ReconstructionJob = {
      projectId: manifest.project.id,
      projectTitle: manifest.project.title,
      createdAt: new Date().toISOString(),
      implementation: "local-rough-proxy",
      status: "warning",
      manifest: {
        project: manifest.project,
        capture: manifest.capture
      },
      stages: [
        "read frames",
        "read masks",
        "estimate alignment",
        "build rough geometry",
        "export files"
      ],
      artifacts,
      warnings
    };
    artifacts.push(
      writeTextArtifact(
        manifest,
        "exports/reconstruction-job.json",
        JSON.stringify(job, null, 2),
        "json",
        "job"
      )
    );

    return {
      status: "warning",
      job: {
        ...job,
        artifacts
      },
      artifacts,
      warnings
    };
  }
}

export const localReconstructionEngine = new LocalReconstructionEngine();

export function runLocalReconstruction(
  manifest: ForgeScanProjectManifest
): Promise<ReconstructionRunResult> {
  return localReconstructionEngine.runReconstruction(manifest);
}

function writeJsonArtifact(
  manifest: ForgeScanProjectManifest,
  path: string,
  content: unknown
): ReconstructionArtifact {
  return writeTextArtifact(
    manifest,
    path,
    JSON.stringify(content, null, 2),
    "json",
    "input"
  );
}

function writeTextArtifact(
  manifest: ForgeScanProjectManifest,
  path: string,
  content: string,
  format: ReconstructionArtifact["format"],
  role: ReconstructionArtifact["role"]
): ReconstructionArtifact {
  return {
    path,
    uri: writeProjectFile(manifest, path, content),
    format,
    role
  };
}

function createAssumedPose(
  rotationId: RotationId,
  index: number,
  total: number
): { yawDegrees: number; tiltDegrees: number } {
  return {
    yawDegrees: total > 0 ? Math.round((index / total) * 360) : 0,
    tiltDegrees:
      rotationId === "upright" ? 0 : rotationId === "tilted" ? 45 : 160
  };
}

function getRotationTransform(rotationId: RotationId): number[] {
  switch (rotationId) {
    case "upright":
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    case "tilted":
      return [1, 0, 0, 0, 0, 0.707, -0.707, 0, 0, 0.707, 0.707, 0, 0, 0, 0, 1];
    case "underside":
      return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
  }
}

function createRoughObj(): string {
  return [
    "# ForgeScan rough proxy mesh",
    "o ForgeScan_Rough_Proxy",
    "v 0 0.7 0",
    "v -0.6 -0.35 0.5",
    "v 0.6 -0.35 0.5",
    "v 0.52 -0.35 -0.55",
    "v -0.52 -0.35 -0.55",
    "f 1 2 3",
    "f 1 3 4",
    "f 1 4 5",
    "f 1 5 2",
    "f 2 5 4 3",
    ""
  ].join("\n");
}

function createPointCloudPly(frameCount: number): string {
  const pointCount = Math.max(32, frameCount * 4);
  const lines = [
    "ply",
    "format ascii 1.0",
    "comment ForgeScan rough point cloud",
    `element vertex ${pointCount}`,
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    "end_header"
  ];

  for (let index = 0; index < pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2;
    const radius = 0.42 + (index % 5) * 0.05;
    lines.push(
      `${round(Math.cos(angle) * radius)} ${round(
        ((index % 9) - 4) * 0.08
      )} ${round(Math.sin(angle) * radius)} 17 100 102`
    );
  }

  return `${lines.join("\n")}\n`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
