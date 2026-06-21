import { ForgeScanProjectManifest } from "../core/manifest";
import { writeFullProjectPackage } from "../storage/projectPackageWriter";
import {
  WorkflowAdvancedDetail,
  WorkflowGeneratedOutput
} from "./create3DResultPipeline";

export interface ExportGroupedOutputs {
  interactiveViewer: WorkflowGeneratedOutput[];
  threeDFiles: WorkflowGeneratedOutput[];
  photorealPackage: WorkflowGeneratedOutput[];
  projectFiles: WorkflowGeneratedOutput[];
}

export interface ExportResultsPipelineResult {
  success: boolean;
  userMessage: string;
  groupedOutputs: ExportGroupedOutputs;
  warnings: string[];
  advancedDetails: WorkflowAdvancedDetail[];
}

export async function exportResults(
  manifest: ForgeScanProjectManifest
): Promise<ExportResultsPipelineResult> {
  const packageResult = await writeFullProjectPackage(
    manifest.project.id,
    manifest
  );
  const groupedOutputs: ExportGroupedOutputs = {
    interactiveViewer: [
      {
        label: "Preview Fallback",
        path: "open_viewer.html",
        group: "interactiveViewer"
      }
    ],
    threeDFiles: [
      {
        label: "Internal Fallback Model",
        path: "fallback/model.obj",
        group: "threeDFiles"
      },
      {
        label: "Internal Fallback Model",
        path: "reconstruction/rough-model.obj",
        group: "threeDFiles"
      },
      {
        label: "Internal Point Cloud",
        path: "reconstruction/point-cloud.ply",
        group: "threeDFiles"
      }
    ],
    photorealPackage: [
      {
        label: "Internal Splat Inputs",
        path: "exports/splatting-job.json",
        group: "photorealPackage"
      }
    ],
    projectFiles: [
      {
        label: "Internal Source Data",
        path: packageResult.projectRootUri,
        uri: packageResult.projectRootUri,
        group: "projectFiles"
      }
    ]
  };

  return {
    success: true,
    userMessage: "Export Complete",
    groupedOutputs,
    warnings: packageResult.warnings,
    advancedDetails: packageResult.generatedFiles.map((file) => ({
      label: "Generated file",
      value: file
    }))
  };
}
