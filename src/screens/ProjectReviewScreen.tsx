import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { StatusPill } from "../components/StatusPill";
import { getCoverageLabel } from "../core/coverage";
import { validateProjectForReconstruction } from "../core/frameValidation";
import { createReconstructionPlan } from "../core/reconstructionPlan";
import { RootStackParamList } from "../navigation/types";
import { exportTargetPlanJson } from "../core/exportTargets";
import { exportProjectManifestJson } from "../core/projectPackage";
import { createNativeMaskingInput } from "../masking/NativeMaskingInput";
import { runMaskingForProject } from "../masking/MaskingEngine";
import { runReconstructionJob } from "../reconstruction/ReconstructionJobRunner";
import { exportSplattingJob } from "../reconstruction/splatting/splattingPackage";
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
  CreatePhotorealScanPipelineResult,
  PreviewStatusItem,
  WorkflowAdvancedDetail,
  createPhotorealScan
} from "../workflow/createPhotorealScanPipeline";
import {
  ExportPhotorealScanResult,
  exportPhotorealScan
} from "../workflow/exportKsplatsPipeline";
import { NormalExportItem } from "../workflow/exportArtifacts";
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
  const [scanResult, setScanResult] =
    useState<CreatePhotorealScanPipelineResult | null>(null);
  const [exportResult, setExportResult] =
    useState<ExportPhotorealScanResult | null>(null);
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
    : scanResult
      ? "preview"
      : getWorkflowStage(activeProject);
  const workflowProgress = scanResult ? 0.75 : getWorkflowProgress(activeProject);
  const primaryActionLabel = scanResult
    ? exportResult
      ? "Export .ksplat"
      : "Export .ksplat"
    : getPrimaryActionLabel(activeProject);
  const primaryActionDescription = scanResult
    ? "Preview the photoreal scan status, then export the .ksplat target and preview media."
    : getPrimaryActionDescription(activeProject);
  const primaryEnabled =
    !isRunning && (scanResult ? true : canRunPrimaryAction(activeProject));
  const normalExports = exportResult?.normalExports ?? scanResult?.normalExports ?? [];
  const previewStatus = scanResult?.previewStatus ?? [];

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
      await runCreatePhotorealScan();
      return;
    }

    if (workflowStage === "preview" || workflowStage === "export") {
      await runExportPhotorealScan();
    }
  }

  async function runCreatePhotorealScan(): Promise<void> {
    setIsRunning(true);
    setStatusMessage("Checking capture");
    setProgressSteps([
      "Checking capture",
      "Preparing object",
      "Creating photoreal scan",
      "Preparing preview"
    ]);

    try {
      const result = await createPhotorealScan(activeProject);
      setScanResult(result);
      setAdvancedDetails(result.advancedDetails);
      setStatusMessage(result.userMessage);
      setProgressSteps(result.progressSteps);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to create photoreal scan."
      );
    } finally {
      setIsRunning(false);
    }
  }

  async function runExportPhotorealScan(): Promise<void> {
    setIsRunning(true);
    setStatusMessage("Exporting .ksplat");

    try {
      const result = await exportPhotorealScan(activeProject);
      setExportResult(result);
      setAdvancedDetails((details) => [...details, ...result.advancedDetails]);
      setStatusMessage(result.userMessage);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to export .ksplat."
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
          <Text style={styles.sectionTitle}>Splatting</Text>
          {progressSteps.map((step) => (
            <View key={step} style={styles.simpleRow}>
              <Text style={styles.simpleRowTitle}>{step}</Text>
              <StatusPill status="ready" />
            </View>
          ))}
          {scanResult?.warnings.map((warning) => (
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
        {previewStatus.length > 0 ? (
          previewStatus.map((item) => (
            <PreviewStatusCard key={item.label} item={item} />
          ))
        ) : (
          <OutputCard
            title="Photoreal Scan"
            body="Create the photoreal scan to prepare a .ksplat target and preview fallback."
          />
        )}
      </Section>

      {exportResult ? (
        <Section>
          <Text style={styles.sectionTitle}>Export .ksplat</Text>
          <NormalExports outputs={normalExports} />
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
            <Text style={styles.messageText}>Internal alignment: {storagePaths.reconstructionUri}</Text>
            <Text style={styles.messageText}>Exports: {storagePaths.exportsUri}</Text>
            {advancedDetails.map((detail, index) => (
              <Text key={`${detail.label}-${index}`} style={styles.advancedDetail}>
                {detail.label}: {detail.value}
              </Text>
            ))}
            <Button
              disabled={isRunning}
              label="Prepare Object Masks"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Prepare Object Masks", async () => {
                  const result = await runMaskingForProject(activeProject);
                  return `${result.successfulFrames}/${result.totalFrames} internal masks written with ${result.engineName}.`;
                });
              }}
            />
            <Button
              disabled={isRunning}
              label="Preview Masks"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Preview Masks", async () => {
                  const result = await runMaskingForProject(activeProject);
                  const uri = writeProjectFile(
                    activeProject,
                    "exports/mask-preview.json",
                    JSON.stringify(result.artifacts, null, 2)
                  );
                  return uri;
                });
              }}
            />
            <Button
              disabled={isRunning}
              label="Run Internal Alignment"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Run Internal Alignment", async () => {
                  const result = await runReconstructionJob(activeProject);
                  return result.artifacts.map((artifact) => artifact.path).join(", ");
                });
              }}
            />
            <Button
              disabled={isRunning}
              label="Prepare Internal Splatting Job"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Prepare Internal Splatting Job", () => {
                  const result = exportSplattingJob(activeProject);
                  return `${result.frames.length} frames packaged.`;
                });
              }}
            />
            <Button
              disabled={isRunning}
              label="Write Preview Fallback HTML"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Write Preview Fallback HTML", () =>
                  writeViewerHtml(activeProject.project.id, activeProject)
                );
              }}
            />
            <Button
              disabled={isRunning}
              label="Write Internal Source Data"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Write Internal Source Data", async () => {
                  const result = await exportPhotorealScan(activeProject);
                  return result.advancedDetails[0]?.value ?? "Internal files written.";
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
                    `Internal alignment: ${storagePaths.reconstructionUri}`,
                    `Exports: ${storagePaths.exportsUri}`
                  ].join("\n")
                )
              }
            />
            <Button
              disabled={isRunning}
              label="Save Native Masking Input"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Save Native Masking Input", () =>
                  writeProjectExportJson(
                    activeProject,
                    "native-masking-input.json",
                    JSON.stringify(createNativeMaskingInput(activeProject), null, 2)
                  )
                );
              }}
            />
            <Button
              disabled={isRunning}
              label="Save Internal Alignment Plan"
              variant="secondary"
              onPress={() => {
                void runAdvancedAction("Save Internal Alignment Plan", () =>
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

interface PreviewStatusCardProps {
  item: PreviewStatusItem;
}

function PreviewStatusCard({ item }: PreviewStatusCardProps): ReactElement {
  return (
    <View style={styles.outputCard}>
      <Text style={styles.simpleRowTitle}>{item.label}</Text>
      <Text style={styles.simpleRowMeta}>{item.status}</Text>
      <Text style={styles.simpleRowMeta}>{item.detail}</Text>
    </View>
  );
}

interface NormalExportsProps {
  outputs: NormalExportItem[];
}

function NormalExports({ outputs }: NormalExportsProps): ReactElement {
  return (
    <>
      {outputs.map((output) => (
        <View key={output.type} style={styles.outputCard}>
          <Text style={styles.simpleRowTitle}>{output.label}</Text>
          <Text style={styles.simpleRowMeta}>{output.filename}</Text>
          <Text style={styles.simpleRowMeta}>Status: {output.status}</Text>
        </View>
      ))}
    </>
  );
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
