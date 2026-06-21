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
        label: "Interactive Viewer",
        path: "exports/viewer.html",
        group: "interactiveViewer"
      }
    ],
    threeDFiles: [
      {
        label: "Rough 3D Preview",
        path: "exports/model.obj",
        group: "threeDFiles"
      },
      {
        label: "Rough Mesh",
        path: "reconstruction/rough-model.obj",
        group: "threeDFiles"
      },
      {
        label: "Point Cloud",
        path: "reconstruction/point-cloud.ply",
        group: "threeDFiles"
      }
    ],
    photorealPackage: [
      {
        label: "Photoreal Package",
        path: "exports/splatting-job.json",
        group: "photorealPackage"
      }
    ],
    projectFiles: [
      {
        label: "Project Files",
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
