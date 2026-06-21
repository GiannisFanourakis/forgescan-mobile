import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { StatusPill } from "../components/StatusPill";
import { getCoverageLabel } from "../core/coverage";
import { validateProjectForReconstruction } from "../core/frameValidation";
import { createReconstructionPlan } from "../core/reconstructionPlan";
import { segmentationPlanJson } from "../core/segmentationPlan";
import { RootStackParamList } from "../navigation/types";
import { exportTargetPlanJson } from "../core/exportTargets";
import { exportProjectManifestJson } from "../core/projectPackage";
import { runReconstructionJob } from "../reconstruction/ReconstructionJobRunner";
import { exportSplattingJob } from "../reconstruction/splatting/splattingPackage";
import { runSegmentationForProject } from "../segmentation/LocalSegmentationEngine";
import { useProjects } from "../state/ProjectContext";
import {
  getProjectStoragePaths,
  writeProjectExportJson,
  writeProjectFile,
  writeProjectManifestJson
} from "../storage/projectStorage";
import { writeViewerHtml } from "../storage/projectPackageWriter";
import { colors, spacing } from "../ui/theme";
import {
  Create3DResultPipelineResult,
  WorkflowAdvancedDetail,
  WorkflowGeneratedOutput,
  create3DResult
} from "../workflow/create3DResultPipeline";
import {
  ExportResultsPipelineResult,
  exportResults
} from "../workflow/exportResultsPipeline";
import {
  WorkflowStage,
  canRunPrimaryAction,
  getPrimaryActionDescription,
  getPrimaryActionLabel,
  getWorkflowProgress,
  getWorkflowStage,
  workflowStageLabels
} from "../workflow/workflowState";

const workflowOrder: WorkflowStage[] = [
  "capture",
  "processing",
  "preview",
  "export"
];

type Props = NativeStackScreenProps<RootStackParamList, "ProjectReview">;

export function ProjectReviewScreen({
  navigation,
  route
}: Props): ReactElement {
  const { getProject } = useProjects();
  const project = getProject(route.params.projectId);
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [progressSteps, setProgressSteps] = useState<string[]>([]);
  const [createResult, setCreateResult] =
    useState<Create3DResultPipelineResult | null>(null);
  const [exportResult, setExportResult] =
    useState<ExportResultsPipelineResult | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedDetails, setAdvancedDetails] = useState<WorkflowAdvancedDetail[]>([]);

  const validation = useMemo(
    () => (project ? validateProjectForReconstruction(project) : undefined),
    [project]
  );
  const storagePaths = useMemo(
    () => (project ? getProjectStoragePaths(project) : undefined),
    [project]
  );

  if (!project || !validation || !storagePaths) {
    return (
      <Screen>
        <Text style={styles.title}>Project not found</Text>
      </Screen>
    );
  }

  const activeProject = project;
  const workflowStage = exportResult
    ? "export"
    : createResult
      ? "preview"
      : getWorkflowStage(activeProject);
  const workflowProgress = createResult ? 0.75 : getWorkflowProgress(activeProject);
  const primaryActionLabel = createResult
    ? exportResult
      ? "Export Results"
      : "Export Results"
    : getPrimaryActionLabel(activeProject);
  const primaryActionDescription = createResult
    ? "Inspect the preview outputs, then export grouped results."
    : getPrimaryActionDescription(activeProject);
  const primaryEnabled =
    !isRunning && (createResult ? true : canRunPrimaryAction(activeProject));
  const generatedOutputs = createResult?.generatedOutputs ?? [];
  const groupedExportOutputs = exportResult?.groupedOutputs;

  async function handlePrimaryAction(): Promise<void> {
    if (workflowStage === "capture") {
      const nextRotation = activeProject.capture.rotations.find(
        (rotation) => rotation.required && rotation.status !== "complete"
      );
      navigation.navigate("CapturePlan", { projectId: activeProject.project.id });
      if (nextRotation) {
        return;
      }
      return;
    }

    if (workflowStage === "processing") {
      await runCreate3DResult();
      return;
    }

    if (workflowStage === "preview" || workflowStage === "export") {
      await runExportResults();
    }
  }

  async function runCreate3DResult(): Promise<void> {
    setIsRunning(true);
    setStatusMessage("Checking capture");
    setProgressSteps([
      "Checking capture",
      "Preparing object",
      "Creating 3D preview",
      "Preparing photoreal package",
      "Creating viewer"
    ]);

    try {
      const result = await create3DResult(activeProject);
      setCreateResult(result);
      setAdvancedDetails(result.advancedDetails);
      setStatusMessage(result.userMessage);
      setProgressSteps(result.progressSteps);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to create 3D result."
      );
    } finally {
      setIsRunning(false);
    }
  }

  async function runExportResults(): Promise<void> {
    setIsRunning(true);
    setStatusMessage("Exporting results");

    try {
      const result = await exportResults(activeProject);
      setExportResult(result);
      setAdvancedDetails((details) => [...details, ...result.advancedDetails]);
      setStatusMessage(result.userMessage);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to export results."
      );
    } finally {
      setIsRunning(false);
    }
  }

  async function runAdvancedAction(
    label: string,
    action: () => Promise<string> | string
  ): Promise<void> {
    setIsRunning(true);
    setStatusMessage(`${label} running...`);

    try {
      const message = await action();
      setStatusMessage(message);
      setAdvancedDetails((details) => [
        ...details,
        { label, value: message }
      ]);
    } catch (error: unknown) {
      setStatusMessage(error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>{activeProject.project.title}</Text>
        <Text style={styles.meta}>
          Current step: {workflowStageLabels[workflowStage]}
        </Text>
      </Section>

      <View style={styles.workflowCard}>
        <View style={styles.workflowSteps}>
          {workflowOrder.map((stage, index) => (
            <View
              key={stage}
              style={[
                styles.workflowStep,
                stage === workflowStage ? styles.workflowStepActive : undefined
              ]}
            >
              <Text
                style={[
                  styles.workflowStepNumber,
                  stage === workflowStage ? styles.workflowStepNumberActive : undefined
                ]}
              >
                {index + 1}
              </Text>
              <Text
                style={[
                  styles.workflowStepLabel,
                  stage === workflowStage ? styles.workflowStepLabelActive : undefined
                ]}
              >
                {workflowStageLabels[stage]}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(workflowProgress * 100)}%` }
            ]}
          />
        </View>
      </View>

      <View style={styles.primaryCard}>
        <Text style={styles.sectionTitle}>{workflowStageLabels[workflowStage]}</Text>
        <Text style={styles.messageText}>{primaryActionDescription}</Text>
        <Button
          disabled={!primaryEnabled}
          label={isRunning ? "Working" : primaryActionLabel}
          onPress={() => {
            void handlePrimaryAction();
          }}
        />
      </View>

      {statusMessage ? <Text style={styles.message}>{statusMessage}</Text> : null}

      {progressSteps.length > 0 ? (
        <Section>
          <Text style={styles.sectionTitle}>Photogrammetry / Splatting</Text>
          {progressSteps.map((step) => (
            <View key={step} style={styles.simpleRow}>
              <Text style={styles.simpleRowTitle}>{step}</Text>
              <StatusPill status="ready" />
            </View>
          ))}
          {createResult?.warnings.map((warning) => (
            <Text key={warning} style={[styles.message, styles.warning]}>
              {warning}
            </Text>
          ))}
        </Section>
      ) : null}

      <Section>
        <Text style={styles.sectionTitle}>Capture</Text>
        {activeProject.capture.rotations.map((rotation) => (
          <View key={rotation.id} style={styles.simpleRow}>
            <View style={styles.rowText}>
              <Text style={styles.simpleRowTitle}>{rotation.label}</Text>
              <Text style={styles.simpleRowMeta}>
                {rotation.frames.length} frames / {getCoverageLabel(rotation.frames.length)}
              </Text>
            </View>
            <StatusPill status={rotation.status} />
          </View>
        ))}
      </Section>

      <Section>
        <Text style={styles.sectionTitle}>Preview</Text>
        <OutputCard
          title="Interactive Preview"
          body={findOutputPath(generatedOutputs, "interactiveViewer") ?? "Create the 3D result to generate the viewer."}
        />
        <OutputCard
          title="Rough 3D Preview"
          body={findThreeDOutput(generatedOutputs) ?? "Create the 3D result to generate rough model files."}
        />
        <OutputCard
          title="Photoreal Package"
          body={findOutputPath(generatedOutputs, "photorealPackage") ?? "Photoreal package will be prepared during 3D creation."}
        />
        <OutputCard
          title="Captured Frames"
          body={`${activeProject.capture.rotations.reduce(
            (sum, rotation) => sum + rotation.frames.length,
            0
          )} captured frames`}
        />
      </Section>

      {groupedExportOutputs ? (
        <Section>
          <Text style={styles.sectionTitle}>Export Complete</Text>
          <OutputGroup title="Interactive Viewer" outputs={groupedExportOutputs.interactiveViewer} />
          <OutputGroup title="3D Files" outputs={groupedExportOutputs.threeDFiles} />
          <OutputGroup title="Photoreal Processing Package" outputs={groupedExportOutputs.photorealPackage} />
          <OutputGroup title="Project Files" outputs={groupedExportOutputs.projectFiles} />
        </Section>
      ) : null}

      <Section>
        <Pressable
          accessibilityRole="button"
          onPress={() => setAdvancedOpen((value) => !value)}
          style={styles.advancedToggle}
        >
          <Text style={styles.advancedToggleText}>
            {advancedOpen ? "Hide Advanced Details" : "Show Advanced Details"}
          </Text>
        </Pressable>
        {advancedOpen ? (
          <View style={styles.advancedPanel}>
            <Text style={styles.sectionTitle}>Advanced Details</Text>
            <Text style={styles.messageText}>Project: {storagePaths.projectUri}</Text>
            <Text style={styles.messageText}>Masks: {storagePaths.masksUri}</Text>
            <Text style={styles.messageText}>Reconstruction: {storagePaths.reconstructionUri}</Text>
            <Text style={styles.messageText}>Exports: {storagePaths.exportsUri}</Text>
            {advancedDetails.map((detail, index) => (
              <Text key={`${detail.label}-${index}`} style={styles.advancedDetail}>
                {detail.label}: {detail.value}
              </Text>
            ))}
            <Button
              disabled={isRunning}
              label="Run Background Removal"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Run Background Removal", async () => {
                  const result = await runSegmentationForProject(activeProject);
                  return `${result.successfulFrames}/${result.totalFrames} object-separation masks written.`;
                });
              }}
            />
            <Button
              disabled={isRunning}
              label="Preview Masks"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Preview Masks", async () => {
                  const result = await runSegmentationForProject(activeProject);
                  const uri = writeProjectFile(
                    activeProject,
                    "exports/mask-preview.json",
                    JSON.stringify(result.previews, null, 2)
                  );
                  return uri;
                });
              }}
            />
            <Button
              disabled={isRunning}
              label="Run Reconstruction"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Run Reconstruction", async () => {
                  const result = await runReconstructionJob(activeProject);
                  return result.artifacts.map((artifact) => artifact.path).join(", ");
                });
              }}
            />
            <Button
              disabled={isRunning}
              label="Prepare Gaussian Splatting Job"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Prepare Gaussian Splatting Job", () => {
                  const result = exportSplattingJob(activeProject);
                  return `${result.frames.length} frames packaged.`;
                });
              }}
            />
            <Button
              disabled={isRunning}
              label="Export Viewer HTML"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Export Viewer HTML", () =>
                  writeViewerHtml(activeProject.project.id, activeProject)
                );
              }}
            />
            <Button
              disabled={isRunning}
              label="Export Project Package"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Export Project Package", async () => {
                  const result = await exportResults(activeProject);
                  return result.groupedOutputs.projectFiles[0]?.uri ?? "Project files written.";
                });
              }}
            />
            <Button
              disabled={isRunning}
              label="Show Output Paths"
              variant="secondary"
              onPress={() =>
                setStatusMessage(
                  [
                    `Project: ${storagePaths.projectUri}`,
                    `Masks: ${storagePaths.masksUri}`,
                    `Reconstruction: ${storagePaths.reconstructionUri}`,
                    `Exports: ${storagePaths.exportsUri}`
                  ].join("\n")
                )
              }
            />
            <Button
              disabled={isRunning}
              label="Save Segmentation Plan"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Save Segmentation Plan", () =>
                  writeProjectExportJson(
                    activeProject,
                    "segmentation-plan.json",
                    segmentationPlanJson(activeProject)
                  )
                );
              }}
            />
            <Button
              disabled={isRunning}
              label="Save Reconstruction Plan"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Save Reconstruction Plan", () =>
                  writeProjectExportJson(
                    activeProject,
                    "reconstruction-plan.json",
                    JSON.stringify(createReconstructionPlan(activeProject), null, 2)
                  )
                );
              }}
            />
            <Button
              disabled={isRunning}
              label="Save Export Target Plan"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Save Export Target Plan", () =>
                  writeProjectExportJson(activeProject, "export-targets.json", exportTargetPlanJson(activeProject))
                );
              }}
            />
            <Button
              disabled={isRunning}
              label="Export Project Manifest"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Export Project Manifest", () =>
                  writeProjectManifestJson(activeProject, exportProjectManifestJson(activeProject))
                );
              }}
            />
          </View>
        ) : null}
      </Section>
    </Screen>
  );
}

interface OutputCardProps {
  title: string;
  body: string;
}

function OutputCard({ title, body }: OutputCardProps): ReactElement {
  return (
    <View style={styles.outputCard}>
      <Text style={styles.simpleRowTitle}>{title}</Text>
      <Text style={styles.simpleRowMeta}>{body}</Text>
    </View>
  );
}

interface OutputGroupProps {
  title: string;
  outputs: WorkflowGeneratedOutput[];
}

function OutputGroup({ title, outputs }: OutputGroupProps): ReactElement {
  return (
    <View style={styles.outputCard}>
      <Text style={styles.simpleRowTitle}>{title}</Text>
      {outputs.map((output) => (
        <Text key={`${output.label}-${output.path}`} style={styles.simpleRowMeta}>
          {output.label}: {output.uri ?? output.path}
        </Text>
      ))}
    </View>
  );
}

function findOutputPath(
  outputs: WorkflowGeneratedOutput[],
  group: WorkflowGeneratedOutput["group"]
): string | undefined {
  const output = outputs.find((candidate) => candidate.group === group);
  return output?.uri ?? output?.path;
}

function findThreeDOutput(outputs: WorkflowGeneratedOutput[]): string | undefined {
  const output = outputs.find((candidate) => candidate.group === "threeDFiles");
  return output?.uri ?? output?.path;
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900"
  },
  meta: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  workflowCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  workflowSteps: {
    gap: spacing.sm
  },
  workflowStep: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  workflowStepActive: {
    opacity: 1
  },
  workflowStepNumber: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    height: 26,
    lineHeight: 26,
    textAlign: "center",
    width: 26
  },
  workflowStepNumberActive: {
    backgroundColor: colors.accent,
    color: "#ffffff"
  },
  workflowStepLabel: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: "800"
  },
  workflowStepLabelActive: {
    color: colors.text
  },
  progressTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    height: 8,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 8
  },
  primaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  messageText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  message: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    padding: spacing.md
  },
  warning: {
    borderColor: colors.warning,
    color: colors.warning
  },
  simpleRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.md
  },
  rowText: {
    flex: 1,
    gap: 2
  },
  simpleRowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  simpleRowMeta: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18
  },
  outputCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: spacing.md
  },
  advancedToggle: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 46,
    justifyContent: "center"
  },
  advancedToggleText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  advancedPanel: {
    gap: spacing.sm
  },
  advancedDetail: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    padding: spacing.md
  }
});
