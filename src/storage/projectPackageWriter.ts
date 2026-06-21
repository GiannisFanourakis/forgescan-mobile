import { Directory, File } from "expo-file-system";

import { exportTargetPlanJson } from "../core/exportTargets";
import { ForgeScanProjectManifest } from "../core/manifest";
import { createReconstructionPlan } from "../core/reconstructionPlan";
import { segmentationPlanJson } from "../core/segmentationPlan";
import { runReconstructionJob } from "../reconstruction/ReconstructionJobRunner";
import { ReconstructionJob } from "../reconstruction/ReconstructionTypes";
import {
  createSplattingCameraData,
  exportSplattingJob
} from "../reconstruction/splatting/splattingPackage";
import {
  createPhotorealAsset,
  getPhotorealStatusLabel
} from "../reconstruction/splatting/photorealAsset";
import { runSegmentationForProject } from "../segmentation/LocalSegmentationEngine";
import {
  ensureProjectStorage,
  getProjectDirectory,
  getProjectsRootDirectory,
  persistProjectManifest,
  writeProjectFile
} from "./projectStorage";

export interface FullProjectPackageResult {
  projectRootUri: string;
  generatedFiles: string[];
  warnings: string[];
}

export function getForgeScanRootUri(): string {
  return getProjectsRootDirectory().uri;
}

export function getProjectRootUri(projectId: string): string {
  return getProjectDirectory(projectId).uri;
}

export function ensureProjectFolders(
  manifestOrProjectId: ForgeScanProjectManifest | string
): string {
  if (typeof manifestOrProjectId === "string") {
    getProjectDirectory(manifestOrProjectId).create({
      intermediates: true,
      idempotent: true
    });
    return getProjectRootUri(manifestOrProjectId);
  }

  return ensureProjectStorage(manifestOrProjectId).projectUri;
}

export function writeTextFile(uri: string, content: string): string {
  const file = new File(uri);
  if (!file.exists) {
    file.create({ intermediates: true, overwrite: true });
  }

  file.write(content);
  return file.uri;
}

export function writeManifestJson(
  projectId: string,
  manifest: ForgeScanProjectManifest
): string {
  void projectId;
  return persistProjectManifest(manifest).manifestUri;
}

export function writeExportTargetPlan(
  projectId: string,
  manifest: ForgeScanProjectManifest
): string {
  void projectId;
  return writeProjectFile(
    manifest,
    "exports/export-targets.json",
    exportTargetPlanJson(manifest)
  );
}

export function writeSegmentationPlan(
  projectId: string,
  manifest: ForgeScanProjectManifest
): string {
  void projectId;
  return writeProjectFile(
    manifest,
    "exports/segmentation-plan.json",
    segmentationPlanJson(manifest)
  );
}

export function writeReconstructionPlan(
  projectId: string,
  manifest: ForgeScanProjectManifest
): string {
  void projectId;
  return writeProjectFile(
    manifest,
    "exports/reconstruction-plan.json",
    JSON.stringify(createReconstructionPlan(manifest), null, 2)
  );
}

export function writeReconstructionJob(
  projectId: string,
  manifest: ForgeScanProjectManifest,
  job: ReconstructionJob
): string {
  void projectId;
  return writeProjectFile(
    manifest,
    "exports/reconstruction-job.json",
    JSON.stringify(job, null, 2)
  );
}

export function writeSplattingJob(
  projectId: string,
  manifest: ForgeScanProjectManifest
): string[] {
  void projectId;
  const job = exportSplattingJob(manifest);
  const jobJson = JSON.stringify(job, null, 2);
  const cameraJson = JSON.stringify(createSplattingCameraData(manifest), null, 2);

  return [
    writeProjectFile(manifest, "photoreal/cameras.json", cameraJson),
    writeProjectFile(manifest, "photoreal/splatting-job.json", jobJson),
    writeProjectFile(manifest, "reconstruction/splatting-job.json", jobJson),
    writeProjectFile(manifest, "exports/splatting-job.json", jobJson)
  ];
}

export function writeViewerHtml(
  projectId: string,
  manifest: ForgeScanProjectManifest,
  html = createViewerHtml(manifest)
): string {
  void projectId;
  return writeProjectFile(manifest, "open_viewer.html", html);
}

export function writeReadmeExports(
  projectId: string,
  manifest: ForgeScanProjectManifest
): string {
  void projectId;
  return writeProjectFile(manifest, "README.txt", createReadme(manifest));
}

export async function writeFullProjectPackage(
  projectId: string,
  manifest: ForgeScanProjectManifest
): Promise<FullProjectPackageResult> {
  const generatedFiles: string[] = [];
  const warnings: string[] = [];

  ensureProjectFolders(manifest);
  generatedFiles.push(writeManifestJson(projectId, manifest));
  generatedFiles.push(writeExportTargetPlan(projectId, manifest));
  generatedFiles.push(writeSegmentationPlan(projectId, manifest));
  generatedFiles.push(writeReconstructionPlan(projectId, manifest));

  const segmentation = await runSegmentationForProject(manifest);
  generatedFiles.push(
    ...segmentation.artifacts.flatMap((artifact) =>
      [artifact.rawMaskUri, artifact.refinedMaskUri].filter(
        (uri): uri is string => Boolean(uri)
      )
    )
  );
  warnings.push(...segmentation.notes);
  generatedFiles.push(
    writeProjectFile(
      manifest,
      "source/frames/frames.json",
      JSON.stringify(
        manifest.capture.rotations.flatMap((rotation) =>
          rotation.frames.map((frame) => ({
            rotationId: rotation.id,
            filename: frame.filename,
            uri: frame.uri,
            frameIndex: frame.index
          }))
        ),
        null,
        2
      )
    ),
    writeProjectFile(
      manifest,
      "source/masks/masks.json",
      JSON.stringify(segmentation.artifacts, null, 2)
    ),
    writeProjectFile(
      manifest,
      "source/manifest.json",
      JSON.stringify(manifest, null, 2)
    )
  );

  const reconstruction = await runReconstructionJob(manifest);
  generatedFiles.push(...reconstruction.artifacts.map((artifact) => artifact.uri));
  generatedFiles.push(writeReconstructionJob(projectId, manifest, reconstruction.job));
  generatedFiles.push(
    writeProjectFile(
      manifest,
      "source/reconstruction-report.json",
      JSON.stringify(reconstruction.job, null, 2)
    )
  );
  generatedFiles.push(...(await writeFallbackArtifacts(manifest, reconstruction)));
  warnings.push(...reconstruction.warnings);

  generatedFiles.push(...writeSplattingJob(projectId, manifest));
  generatedFiles.push(writeViewerHtml(projectId, manifest));
  generatedFiles.push(writeReadmeExports(projectId, manifest));
  warnings.push(
    "Photoreal .ksplat output requires native/external splat optimization; no fake .ksplat was created.",
    "Preview MP4/GIF are unavailable until a native preview renderer is connected."
  );

  return {
    projectRootUri: getProjectRootUri(projectId),
    generatedFiles: [...new Set(generatedFiles)],
    warnings: [...new Set(warnings)]
  };
}

function createViewerHtml(manifest: ForgeScanProjectManifest): string {
  const photorealAsset = createPhotorealAsset(
    manifest,
    "requires-external-optimizer"
  );
  const frames = manifest.capture.rotations.flatMap((rotation) =>
    rotation.frames.map((frame) => ({
      rotation: rotation.label,
      uri: frame.uri,
      index: frame.index
    }))
  );
  const frameJson = JSON.stringify(frames);

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(manifest.project.title)} ForgeScan Viewer</title>`,
    "<style>",
    "body{margin:0;background:#101817;color:#f7f7f4;font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:grid;min-height:100vh;place-items:center}",
    "main{width:min(94vw,860px)}",
    ".viewport{background:#17211f;border:1px solid rgba(255,255,255,.16);border-radius:8px;min-height:360px;display:grid;place-items:center;overflow:hidden}",
    "img{max-width:100%;max-height:70vh;display:block}",
    ".bar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:14px}",
    "button{border:0;border-radius:8px;background:#116466;color:white;font-weight:800;padding:12px 16px}",
    ".meta{color:#dfece8;font-weight:800}",
    ".notice{background:#21312f;border:1px solid rgba(255,255,255,.18);border-radius:8px;color:#f7f7f4;line-height:1.45;margin:0 0 14px;padding:12px 14px}",
    "h1{font-size:22px;margin:0 0 12px}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    `<h1>${escapeHtml(photorealAsset.filename)}</h1>`,
    '<p class="notice">Photoreal .ksplat output requires native/external optimization. Showing preview fallback.</p>',
    '<div class="viewport"><img id="frame" alt="Captured frame"></div>',
    '<div class="bar"><button id="prev">Prev</button><div class="meta" id="meta"></div><button id="next">Next</button></div>',
    "</main>",
    "<script>",
    `const frames=${frameJson};let i=0;const img=document.getElementById('frame');const meta=document.getElementById('meta');function render(){if(!frames.length){meta.textContent='No frames exported';return;}const f=frames[i];img.src=f.uri;meta.textContent=f.rotation+' / frame '+f.index+' / '+(i+1)+' of '+frames.length;}document.getElementById('prev').onclick=()=>{i=(i-1+frames.length)%frames.length;render()};document.getElementById('next').onclick=()=>{i=(i+1)%frames.length;render()};render();`,
    "</script>",
    "</body>",
    "</html>"
  ].join("");
}

async function writeFallbackArtifacts(
  manifest: ForgeScanProjectManifest,
  reconstruction: Awaited<ReturnType<typeof runReconstructionJob>>
): Promise<string[]> {
  const generatedFiles: string[] = [];
  const modelArtifact = reconstruction.artifacts.find(
    (artifact) => artifact.path === "fallback/model.obj"
  );
  const pointCloudArtifact = reconstruction.artifacts.find(
    (artifact) => artifact.path === "reconstruction/point-cloud.ply"
  );

  if (modelArtifact) {
    if (modelArtifact.path === "fallback/model.obj") {
      generatedFiles.push(modelArtifact.uri);
    } else {
      const copiedModel = await copyProjectFileToRelativePath(
        manifest,
        modelArtifact.uri,
        "fallback/model.obj"
      );
      if (copiedModel) {
        generatedFiles.push(copiedModel);
      }
    }
  }

  if (pointCloudArtifact) {
    const copiedPointCloud = await copyProjectFileToRelativePath(
      manifest,
      pointCloudArtifact.uri,
      "fallback/point-cloud.ply"
    );
    if (copiedPointCloud) {
      generatedFiles.push(copiedPointCloud);
    }
  }

  return generatedFiles;
}

async function copyProjectFileToRelativePath(
  manifest: ForgeScanProjectManifest,
  sourceUri: string,
  relativePath: string
): Promise<string | null> {
  const sourceFile = new File(sourceUri);

  if (!sourceFile.exists) {
    return null;
  }

  const pathParts = relativePath.split(/[\\/]/).filter(Boolean);
  const filename = pathParts.pop();

  if (!filename) {
    return null;
  }

  let directory = getProjectDirectory(manifest.project.id);
  directory.create({ intermediates: true, idempotent: true });

  for (const part of pathParts) {
    directory = new Directory(directory, part);
    directory.create({ intermediates: true, idempotent: true });
  }

  const destinationFile = new File(directory, filename);
  if (destinationFile.exists) {
    destinationFile.delete();
  }

  await sourceFile.copy(destinationFile);
  return destinationFile.uri;
}

function createReadme(manifest: ForgeScanProjectManifest): string {
  const photorealAsset = createPhotorealAsset(
    manifest,
    "requires-external-optimizer"
  );

  return [
    "ForgeScan controlled object splatting export",
    "",
    `Primary scan target: ${photorealAsset.filename}`,
    `Status: ${getPhotorealStatusLabel(photorealAsset.status)}`,
    "",
    "A real .ksplat is not generated in this Expo build.",
    "Use photoreal/splatting-job.json and photoreal/cameras.json with a native or external splat optimizer to create the final .ksplat.",
    "",
    "Normal user exports:",
    `- ${photorealAsset.filename} (created after native/external optimization)`,
    "- preview.mp4 (not generated in this build)",
    "- preview.gif (not generated in this build)",
    "",
    "Internal/debug files are kept for Advanced Details only:",
    "- photoreal/splatting-job.json",
    "- photoreal/cameras.json",
    "- source/frames/frames.json",
    "- source/masks/masks.json",
    "- fallback/model.obj",
    "- fallback/point-cloud.ply",
    "- open_viewer.html",
    ""
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
