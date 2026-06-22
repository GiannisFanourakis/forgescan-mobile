import { ForgeScanProjectManifest } from "../core/manifest";
import { validateProjectForReconstruction } from "../core/frameValidation";

export type WorkflowStage = "capture" | "processing" | "preview" | "export";

export const workflowStageLabels: Record<WorkflowStage, string> = {
  capture: "Capture",
  processing: "Splatting",
  preview: "Preview",
  export: "Export"
};

export function getWorkflowStage(
  manifest: ForgeScanProjectManifest
): WorkflowStage {
  if (!isCaptureReady(manifest)) {
    return "capture";
  }

  if (manifest.exports.completed.length > 0) {
    return "export";
  }

  if (manifest.processing.reconstruction.status === "complete") {
    return "preview";
  }

  return "processing";
}

export function getWorkflowStageLabel(
  manifest: ForgeScanProjectManifest
): string {
  return workflowStageLabels[getWorkflowStage(manifest)];
}

export function getWorkflowProgress(
  manifest: ForgeScanProjectManifest
): number {
  const stage = getWorkflowStage(manifest);

  switch (stage) {
    case "capture":
      return isCaptureReady(manifest) ? 0.25 : getCaptureProgress(manifest);
    case "processing":
      return 0.5;
    case "preview":
      return 0.75;
    case "export":
      return 1;
  }
}

export function getPrimaryActionLabel(
  manifest: ForgeScanProjectManifest
): string {
  const stage = getWorkflowStage(manifest);

  switch (stage) {
    case "capture":
      return isCaptureReady(manifest) ? "Review Capture" : "Continue Capture";
    case "processing":
      return "Create .ksplat Preview";
    case "preview":
      return "Open Preview";
    case "export":
      return "Export .ksplat";
  }
}

export function getPrimaryActionDescription(
  manifest: ForgeScanProjectManifest
): string {
  const stage = getWorkflowStage(manifest);

  switch (stage) {
    case "capture":
      return isCaptureReady(manifest)
        ? "Required rotations are complete. Review the capture before creating the photoreal scan."
        : "Capture upright and tilted rotations. Add underside if you want more coverage.";
    case "processing":
      return "Run background removal and splatting in one step, then show the .ksplat preview/export status.";
    case "preview":
      return "Inspect the best available photoreal scan preview and preview media status.";
    case "export":
      return "Export the .ksplat target and preview media status.";
  }
}

export function canRunPrimaryAction(
  manifest: ForgeScanProjectManifest
): boolean {
  const stage = getWorkflowStage(manifest);

  if (stage === "processing") {
    return validateProjectForReconstruction(manifest).validForReconstruction;
  }

  return true;
}

function isCaptureReady(manifest: ForgeScanProjectManifest): boolean {
  return manifest.capture.rotations.every((rotation) => {
    if (!rotation.required) {
      return true;
    }

    return rotation.status === "complete" && rotation.frames.length > 0;
  });
}

function getCaptureProgress(manifest: ForgeScanProjectManifest): number {
  const requiredRotations = manifest.capture.rotations.filter(
    (rotation) => rotation.required
  );
  const completedRequired = requiredRotations.filter(
    (rotation) => rotation.status === "complete" && rotation.frames.length > 0
  );

  if (requiredRotations.length === 0) {
    return 0.25;
  }

  return (completedRequired.length / requiredRotations.length) * 0.25;
}
