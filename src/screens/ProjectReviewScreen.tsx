import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { StatusPill } from "../components/StatusPill";
import { validateProjectForReconstruction } from "../core/frameValidation";
import { ForgeScanProjectManifest } from "../core/manifest";
import { shareNativeFile } from "../native/NativeFileExport";
import { RootStackParamList } from "../navigation/types";
import {
  getPhotorealFileInfo,
  isGeneratedPhotorealFile
} from "../reconstruction/splatting/photorealFile";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";
import {
  CreatePhotorealScanPipelineResult,
  PhotorealScanProgressStage,
  PreviewStatusItem,
  createPhotorealScan
} from "../workflow/createPhotorealScanPipeline";
import { NormalExportItem } from "../workflow/exportArtifacts";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectReview">;
type SimpleStep = "capture" | "process" | "preview";
type ProcessingStageId =
  | "checking"
  | "masking"
  | "splatting"
  | "preview"
  | "finishing";
type ProcessingPhaseEstimate = Record<ProcessingStageId, number>;

const stepOrder: SimpleStep[] = ["capture", "process", "preview"];
const stepLabels: Record<SimpleStep, string> = {
  capture: "Capture",
  process: "Process",
  preview: "Preview & Export"
};
const processingStages: Array<{
  id: ProcessingStageId;
  label: string;
  detail: string;
  start: number;
}> = [
  {
    id: "checking",
    label: "Checking clip",
    detail: "Validating capture and output paths",
    start: 0
  },
  {
    id: "masking",
    label: "Removing background",
    detail: "Sampling video frames and writing object masks",
    start: 0.12
  },
  {
    id: "splatting",
    label: "Building .ksplat",
    detail: "Optimizing the phone-safe splat cloud",
    start: 0.48
  },
  {
    id: "preview",
    label: "Preparing preview",
    detail: "Validating the generated scan file",
    start: 0.84
  },
  {
    id: "finishing",
    label: "Finishing",
    detail: "Unlocking preview and export",
    start: 0.94
  }
];

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
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(
    null
  );
  const [processingNow, setProcessingNow] = useState(Date.now());
  const [processingStageId, setProcessingStageId] =
    useState<ProcessingStageId>("checking");
  const [processingStageStartedAt, setProcessingStageStartedAt] = useState<
    number | null
  >(null);
  const autoStartedRef = useRef(false);

  const validation = useMemo(
    () => (project ? validateProjectForReconstruction(project) : undefined),
    [project]
  );
  useEffect(() => {
    if (
      !route.params.autoProcess ||
      autoStartedRef.current ||
      !project ||
      !validation?.validForReconstruction ||
      scanResult ||
      isRunning
    ) {
      return;
    }

    autoStartedRef.current = true;
    void runScanProcessing(project);
  }, [isRunning, project, route.params.autoProcess, scanResult, validation?.validForReconstruction]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const timer = setInterval(() => {
      setProcessingNow(Date.now());
    }, 250);

    return () => clearInterval(timer);
  }, [isRunning]);

  if (!project || !validation) {
    return (
      <Screen>
        <Text style={styles.title}>Project not found</Text>
      </Screen>
    );
  }

  const manifest = project;
  const projectValidation = validation;
  const activeStep: SimpleStep = scanResult
    ? "preview"
    : projectValidation.validForReconstruction
      ? "process"
      : "capture";
  const primaryLabel = projectValidation.validForReconstruction
    ? scanResult
      ? "Rebuild .ksplat Preview"
      : "Process Scan"
    : "Back to Capture";
  const normalExports = scanResult?.normalExports ?? [];
  const previewStatus = scanResult?.previewStatus ?? [];
  const ksplatUri = normalExports.find((output) => output.type === "ksplat")?.uri;
  const photorealFile = getPhotorealFileInfo(manifest, ksplatUri);
  const generatedPhotorealFile = isGeneratedPhotorealFile(photorealFile);
  const displayNormalExports =
    normalExports.length > 0
      ? normalExports.map((output) =>
          output.type === "ksplat" && generatedPhotorealFile
            ? { ...output, uri: photorealFile.uri, status: "Generated" as const }
            : output
        )
      : generatedPhotorealFile
        ? createGeneratedExportItems(photorealFile)
        : [];
  const estimatedProcessingSeconds = estimateProcessingSeconds(manifest);
  const processingPhaseEstimate = estimateProcessingPhaseSeconds(manifest);
  const elapsedProcessingSeconds =
    processingStartedAt === null
      ? 0
      : Math.max(0, (processingNow - processingStartedAt) / 1000);
  const elapsedStageSeconds =
    processingStageStartedAt === null
      ? elapsedProcessingSeconds
      : Math.max(0, (processingNow - processingStageStartedAt) / 1000);
  const processingProgress = isRunning
    ? getPhaseProgress(
        processingStageId,
        elapsedStageSeconds,
        processingPhaseEstimate
      )
    : scanResult
      ? 1
      : 0;
  const currentProcessingStage = getProcessingStageById(processingStageId);
  const remainingProcessingSeconds = isRunning
    ? estimateRemainingProcessingSeconds(
        processingStageId,
        elapsedStageSeconds,
        processingPhaseEstimate
      )
    : 0;

  async function runScanProcessing(manifest: ForgeScanProjectManifest): Promise<void> {
    const startedAt = Date.now();
    setIsRunning(true);
    setProcessingStartedAt(startedAt);
    setProcessingStageStartedAt(startedAt);
    setProcessingStageId("checking");
    setProcessingNow(startedAt);
    setStatusMessage("Processing scan");
    setProgressSteps([
      "Removing background",
      "Building .ksplat",
      "Opening preview"
    ]);

    try {
      await waitForUiFrame();
      const result = await createPhotorealScan(manifest, (progress) => {
        const stage = toProcessingStageId(progress.stage);
        const now = Date.now();
        setProcessingStageId(stage);
        setProcessingStageStartedAt(now);
        setProcessingNow(now);
        setStatusMessage(progress.message);
      });
      setScanResult(result);
      setStatusMessage(result.userMessage);
      setProgressSteps(result.progressSteps);
      await waitForMilliseconds(550);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to process scan."
      );
    } finally {
      setIsRunning(false);
      setProcessingNow(Date.now());
    }
  }

  function handlePrimaryAction(): void {
    if (!projectValidation.validForReconstruction) {
      navigation.navigate("CapturePlan", { projectId: manifest.project.id });
      return;
    }

    void runScanProcessing(manifest);
  }

  async function handleExportKsplat(): Promise<void> {
    if (!generatedPhotorealFile) {
      setExportMessage("Process the clip before exporting the .ksplat.");
      return;
    }

    const result = await shareNativeFile({
      uri: photorealFile.uri,
      filename: photorealFile.filename,
      mimeType: "application/octet-stream",
      title: "Export ForgeScan .ksplat"
    });

    setExportMessage(
      result.status === "shared"
        ? "Export sheet opened."
        : result.errors[0] ?? "Unable to export .ksplat."
    );
  }

  function handleViewKsplat(): void {
    navigation.navigate("PhotorealViewer", {
      projectId: manifest.project.id,
      ...(generatedPhotorealFile ? { ksplatUri: photorealFile.uri } : {})
    });
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>{manifest.project.title}</Text>
        <Text style={styles.meta}>
          One clip can process. More angles improve the preview and .ksplat.
        </Text>
      </Section>

      <View style={styles.stepCard}>
        {stepOrder.map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <Text
              style={[
                styles.stepNumber,
                step === activeStep ? styles.stepNumberActive : undefined
              ]}
            >
              {index + 1}
            </Text>
            <Text
              style={[
                styles.stepLabel,
                step === activeStep ? styles.stepLabelActive : undefined
              ]}
            >
              {stepLabels[step]}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.primaryCard}>
        <Text style={styles.sectionTitle}>{stepLabels[activeStep]}</Text>
        <Text style={styles.messageText}>
          {activeStep === "capture"
            ? "Capture or load at least one clip first."
            : activeStep === "process"
              ? "One tap runs background removal and splatting."
              : "Your .ksplat status and export target are ready below."}
        </Text>
        <Button
          disabled={isRunning}
          label={isRunning ? "Processing" : primaryLabel}
          onPress={handlePrimaryAction}
        />
      </View>

      {statusMessage ? <Text style={styles.message}>{statusMessage}</Text> : null}

      <Section>
        <Text style={styles.sectionTitle}>Capture</Text>
        {manifest.capture.rotations.map((rotation) => (
          <View key={rotation.id} style={styles.simpleRow}>
            <View style={styles.rowText}>
              <Text style={styles.simpleRowTitle}>{rotation.label}</Text>
              <Text style={styles.simpleRowMeta}>
                {(rotation.videos?.length ?? 0)} clip
                {(rotation.videos?.length ?? 0) === 1 ? "" : "s"}
              </Text>
            </View>
            <StatusPill status={rotation.status} />
          </View>
        ))}
      </Section>

      {progressSteps.length > 0 ? (
        <Section>
          <Text style={styles.sectionTitle}>Process</Text>
          {progressSteps.map((step) => (
            <View key={step} style={styles.simpleRow}>
              <Text style={styles.simpleRowTitle}>{step}</Text>
              <StatusPill status={isRunning ? "capturing" : "complete"} />
            </View>
          ))}
          {getUserFacingWarnings(scanResult?.warnings ?? []).map((warning) => (
            <Text key={warning} style={[styles.message, styles.warning]}>
              {warning}
            </Text>
          ))}
        </Section>
      ) : null}

      <Section>
        <Text style={styles.sectionTitle}>Preview & Export</Text>
        {previewStatus.length > 0 ? (
          previewStatus.map((item) => (
            <PreviewStatusCard key={item.label} item={item} />
          ))
        ) : (
          <OutputCard
            title=".ksplat Preview"
            body="Process the scan to generate the preview/export status."
          />
        )}
        {displayNormalExports.length > 0 ? (
          <NormalExports
            canOpenKsplat={generatedPhotorealFile}
            onExportKsplat={() => {
              void handleExportKsplat();
            }}
            onViewKsplat={handleViewKsplat}
            outputs={displayNormalExports}
          />
        ) : null}
        {exportMessage ? (
          <Text style={styles.message}>{exportMessage}</Text>
        ) : null}
      </Section>

      {scanResult?.advancedDetails.length ? (
        <Section>
          <Text style={styles.sectionTitle}>Advanced Details</Text>
          {scanResult.advancedDetails.map((detail, index) => (
            <View key={`${detail.label}-${index}`} style={styles.outputCard}>
              <Text style={styles.simpleRowTitle}>{detail.label}</Text>
              <Text style={styles.simpleRowMeta}>{detail.value}</Text>
            </View>
          ))}
        </Section>
      ) : null}
      <ProcessingOverlay
        elapsedSeconds={elapsedProcessingSeconds}
        estimatedSeconds={estimatedProcessingSeconds}
        etaSeconds={remainingProcessingSeconds}
        progress={processingProgress}
        stage={currentProcessingStage}
        visible={isRunning}
      />
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
  canOpenKsplat: boolean;
  onExportKsplat: () => void;
  onViewKsplat: () => void;
  outputs: NormalExportItem[];
}

function NormalExports({
  canOpenKsplat,
  onExportKsplat,
  onViewKsplat,
  outputs
}: NormalExportsProps): ReactElement {
  return (
    <>
      {outputs.map((output) => (
        <View key={output.type} style={styles.outputCard}>
          <Text style={styles.simpleRowTitle}>{output.label}</Text>
          <Text style={styles.simpleRowMeta}>{output.filename}</Text>
          <Text style={styles.simpleRowMeta}>Status: {output.status}</Text>
          {output.type === "ksplat" ? (
            <View style={styles.outputActions}>
              <Button
                disabled={!canOpenKsplat}
                label="View"
                onPress={onViewKsplat}
                variant="secondary"
              />
              <Button
                disabled={!canOpenKsplat}
                label="Export"
                onPress={onExportKsplat}
              />
            </View>
          ) : null}
        </View>
      ))}
    </>
  );
}

function createGeneratedExportItems(
  file: ReturnType<typeof getPhotorealFileInfo>
): NormalExportItem[] {
  return [
    {
      type: "ksplat",
      label: "Photoreal 3D Scan",
      filename: file.filename,
      path: file.path,
      uri: file.uri,
      status: "Generated"
    },
    {
      type: "mp4",
      label: "Preview Video",
      filename: "preview.mp4",
      path: "preview/preview.mp4",
      status: "Requires native preview rendering"
    },
    {
      type: "gif",
      label: "Preview GIF",
      filename: "preview.gif",
      path: "preview/preview.gif",
      status: "Requires native preview rendering"
    }
  ];
}

function getUserFacingWarnings(warnings: string[]): string[] {
  const technicalPattern = /arcore|tracked|tracking|pose|camera matrix|frames/i;
  const filtered = warnings.filter((warning) => !technicalPattern.test(warning));

  if (filtered.length > 0) {
    return filtered;
  }

  return warnings.length > 0
    ? ["Clip scan processing used the current local phone-safe path."]
    : [];
}

interface ProcessingOverlayProps {
  elapsedSeconds: number;
  estimatedSeconds: number;
  etaSeconds: number;
  progress: number;
  stage: (typeof processingStages)[number];
  visible: boolean;
}

function ProcessingOverlay({
  elapsedSeconds,
  estimatedSeconds,
  etaSeconds,
  progress,
  stage,
  visible
}: ProcessingOverlayProps): ReactElement {
  const percent = Math.max(1, Math.round(progress * 100));
  const pulseIndex = Math.floor(elapsedSeconds * 3) % 4;

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.processingBackdrop}>
        <View style={styles.processingPanel}>
          <View style={styles.processingHeader}>
            <View>
              <Text style={styles.processingTitle}>Processing scan</Text>
              <Text style={styles.processingStage}>{stage.label}</Text>
            </View>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
          <Text style={styles.processingDetail}>{stage.detail}</Text>
          <View style={styles.liveRail}>
            {[0, 1, 2, 3].map((index) => (
              <View
                key={index}
                style={[
                  styles.liveRailSegment,
                  index === pulseIndex ? styles.liveRailSegmentActive : undefined
                ]}
              />
            ))}
          </View>
          <View style={styles.progressTrackLarge}>
            <View
              style={[
                styles.progressFillLarge,
                {
                  width: `${percent}%`
                }
              ]}
            />
          </View>
          <View style={styles.processingStats}>
            <Text style={styles.processingStat}>{percent}%</Text>
            <Text style={styles.processingStat}>
              ETA {formatDuration(etaSeconds)}
            </Text>
            <Text style={styles.processingStat}>
              {formatDuration(elapsedSeconds)} elapsed
            </Text>
          </View>
          <Text style={styles.processingEstimate}>
            Estimated workload: {formatDuration(estimatedSeconds)}. The phone is still
            processing while this moves.
          </Text>
          <View style={styles.stageList}>
            {processingStages.map((candidate) => {
              const completed = progress >= candidate.start;
              const active = candidate.id === stage.id;

              return (
                <View key={candidate.id} style={styles.stageRow}>
                  <View
                    style={[
                      styles.stageDot,
                      completed ? styles.stageDotDone : undefined,
                      active ? styles.stageDotActive : undefined
                    ]}
                  />
                  <Text
                    style={[
                      styles.stageRowText,
                      active ? styles.stageRowTextActive : undefined
                    ]}
                  >
                    {candidate.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function estimateProcessingSeconds(manifest: ForgeScanProjectManifest): number {
  const estimates = estimateProcessingPhaseSeconds(manifest);
  return Object.values(estimates).reduce((sum, value) => sum + value, 0);
}

function estimateProcessingPhaseSeconds(
  manifest: ForgeScanProjectManifest
): ProcessingPhaseEstimate {
  const videoCount = manifest.capture.rotations.reduce(
    (sum, rotation) => sum + (rotation.videos?.length ?? 0),
    0
  );
  const frameCount = manifest.capture.rotations.reduce(
    (sum, rotation) => sum + rotation.frames.length,
    0
  );
  const maskUnits = Math.max(frameCount, videoCount * 96, 96);

  return {
    checking: 3,
    masking: Math.max(24, Math.min(160, maskUnits * 0.9 + videoCount * 10)),
    splatting: Math.max(32, Math.min(220, maskUnits * 1.15 + videoCount * 18)),
    preview: 5,
    finishing: 3
  };
}

function getPhaseProgress(
  stageId: ProcessingStageId,
  elapsedStageSeconds: number,
  estimates: ProcessingPhaseEstimate
): number {
  const stage = getProcessingStageById(stageId);
  const nextStage = getNextProcessingStage(stageId);
  const end = nextStage?.start ?? 0.99;
  const stageSpan = Math.max(0.01, end - stage.start);
  const stageEstimate = Math.max(1, estimates[stageId]);
  const stageRatio = Math.min(0.92, elapsedStageSeconds / stageEstimate);
  return Math.min(0.985, stage.start + stageSpan * stageRatio);
}

function estimateRemainingProcessingSeconds(
  stageId: ProcessingStageId,
  elapsedStageSeconds: number,
  estimates: ProcessingPhaseEstimate
): number {
  const currentIndex = processingStages.findIndex((stage) => stage.id === stageId);
  const currentRemaining = Math.max(1, estimates[stageId] - elapsedStageSeconds);
  const laterRemaining = processingStages
    .slice(Math.max(0, currentIndex + 1))
    .reduce((sum, stage) => sum + estimates[stage.id], 0);
  return Math.ceil(currentRemaining + laterRemaining);
}

function getProcessingStageById(
  id: ProcessingStageId
): (typeof processingStages)[number] {
  return (
    processingStages.find((stage) => stage.id === id) ?? getDefaultProcessingStage()
  );
}

function getNextProcessingStage(
  id: ProcessingStageId
): (typeof processingStages)[number] | undefined {
  const currentIndex = processingStages.findIndex((stage) => stage.id === id);
  return currentIndex < 0 ? undefined : processingStages[currentIndex + 1];
}

function toProcessingStageId(
  stage: PhotorealScanProgressStage
): ProcessingStageId {
  return stage;
}

function getDefaultProcessingStage(): (typeof processingStages)[number] {
  const stage = processingStages[0];
  if (!stage) {
    throw new Error("Processing stages are not configured.");
  }

  return stage;
}

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;

  if (minutes <= 0) {
    return `${remainder}s`;
  }

  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function waitForUiFrame(): Promise<void> {
  return waitForMilliseconds(80);
}

function waitForMilliseconds(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
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
  stepCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  stepRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  stepNumber: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    height: 28,
    lineHeight: 28,
    textAlign: "center",
    width: 28
  },
  stepNumberActive: {
    backgroundColor: colors.accent,
    color: "#ffffff"
  },
  stepLabel: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: "800"
  },
  stepLabelActive: {
    color: colors.text
  },
  primaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  readinessCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  readinessGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  readinessMetric: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    gap: 2,
    minWidth: "47%",
    padding: spacing.sm
  },
  readinessMetricLabel: {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  readinessMetricValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  readinessRotationRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingTop: spacing.sm
  },
  readinessStatusText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
    textTransform: "capitalize"
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
  outputActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  processingBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(16, 24, 23, 0.72)",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl
  },
  processingPanel: {
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    maxWidth: 420,
    minHeight: 360,
    padding: spacing.lg,
    width: "100%"
  },
  processingHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  processingTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900"
  },
  processingStage: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  processingDetail: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18
  },
  liveRail: {
    flexDirection: "row",
    gap: 6
  },
  liveRailSegment: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    flex: 1,
    height: 6
  },
  liveRailSegmentActive: {
    backgroundColor: colors.accent
  },
  progressTrackLarge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    height: 16,
    overflow: "hidden"
  },
  progressFillLarge: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 16
  },
  processingStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  processingStat: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  },
  processingEstimate: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  stageList: {
    gap: spacing.sm
  },
  stageRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  stageDot: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    height: 10,
    width: 10
  },
  stageDotActive: {
    backgroundColor: colors.accent
  },
  stageDotDone: {
    backgroundColor: "#d9eadf"
  },
  stageRowText: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700"
  },
  stageRowTextActive: {
    color: colors.text
  }
});
