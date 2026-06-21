import { File } from "expo-file-system";

import { exportTargetPlanJson } from "../core/exportTargets";
import { ForgeScanProjectManifest } from "../core/manifest";
import { createReconstructionPlan } from "../core/reconstructionPlan";
import { segmentationPlanJson } from "../core/segmentationPlan";
import { runReconstructionJob } from "../reconstruction/ReconstructionJobRunner";
import { ReconstructionJob } from "../reconstruction/ReconstructionTypes";
import { exportSplattingJob } from "../reconstruction/splatting/splattingPackage";
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
): string {
  void projectId;
  const job = exportSplattingJob(manifest);
  return writeProjectFile(
    manifest,
    "exports/splatting-job.json",
    JSON.stringify(job, null, 2)
  );
}

export function writeViewerHtml(
  projectId: string,
  manifest: ForgeScanProjectManifest,
  html = createViewerHtml(manifest)
): string {
  void projectId;
  return writeProjectFile(manifest, "exports/viewer.html", html);
}

export function writeReadmeExports(
  projectId: string,
  manifest: ForgeScanProjectManifest
): string {
  void projectId;
  return writeProjectFile(manifest, "exports/README_EXPORTS.txt", createReadme());
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

  const reconstruction = await runReconstructionJob(manifest);
  generatedFiles.push(...reconstruction.artifacts.map((artifact) => artifact.uri));
  generatedFiles.push(writeReconstructionJob(projectId, manifest, reconstruction.job));
  warnings.push(...reconstruction.warnings);

  generatedFiles.push(writeSplattingJob(projectId, manifest));
  generatedFiles.push(writeViewerHtml(projectId, manifest));
  generatedFiles.push(writeReadmeExports(projectId, manifest));

  return {
    projectRootUri: getProjectRootUri(projectId),
    generatedFiles: [...new Set(generatedFiles)],
    warnings: [...new Set(warnings)]
  };
}

function createViewerHtml(manifest: ForgeScanProjectManifest): string {
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
    "</style>",
    "</head>",
    "<body>",
    "<main>",
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

function createReadme(): string {
  return [
    "ForgeScan Mobile export package",
    "",
    "This package is generated locally on device.",
    "Segmentation uses fallback-local mask artifacts unless a native AI model is added.",
    "Reconstruction uses a rough proxy mesh and point cloud when true photogrammetry is unavailable.",
    "Gaussian Splatting exports a job package for a native or external optimizer.",
    "",
    "Important files:",
    "- manifest.json",
    "- exports/segmentation-plan.json",
    "- exports/reconstruction-plan.json",
    "- exports/reconstruction-job.json",
    "- exports/splatting-job.json",
    "- exports/model.obj",
    "- exports/viewer.html",
    "- reconstruction/rough-model.obj",
    "- reconstruction/point-cloud.ply",
    "- masks/raw/{rotation}/frame_001.png",
    "- masks/refined/{rotation}/frame_001.png",
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
