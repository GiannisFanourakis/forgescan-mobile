import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { StatusPill } from "../components/StatusPill";
import { getCoverageLabel } from "../core/coverage";
import { validateProjectForReconstruction } from "../core/frameValidation";
import { ForgeScanProjectManifest } from "../core/manifest";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";
import {
  CreatePhotorealScanPipelineResult,
  PreviewStatusItem,
  createPhotorealScan
} from "../workflow/createPhotorealScanPipeline";
import { NormalExportItem } from "../workflow/exportArtifacts";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectReview">;
type SimpleStep = "capture" | "process" | "preview";

const stepOrder: SimpleStep[] = ["capture", "process", "preview"];
const stepLabels: Record<SimpleStep, string> = {
  capture: "Capture",
  process: "Process",
  preview: "Preview & Export"
};

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

  async function runScanProcessing(manifest: ForgeScanProjectManifest): Promise<void> {
    setIsRunning(true);
    setStatusMessage("Processing scan");
    setProgressSteps([
      "Removing background",
      "Building .ksplat",
      "Opening preview"
    ]);

    try {
      const result = await createPhotorealScan(manifest);
      setScanResult(result);
      setStatusMessage(result.userMessage);
      setProgressSteps(result.progressSteps);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to process scan."
      );
    } finally {
      setIsRunning(false);
    }
  }

  function handlePrimaryAction(): void {
    if (!projectValidation.validForReconstruction) {
      navigation.navigate("CapturePlan", { projectId: manifest.project.id });
      return;
    }

    void runScanProcessing(manifest);
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>{manifest.project.title}</Text>
        <Text style={styles.meta}>
          Capture complete, process once, then preview and export the .ksplat.
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
            ? "Finish the required upright and tilted rotations first."
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
                {rotation.frames.length} frames / {getCoverageLabel(rotation.frames.length)}
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
          {scanResult?.warnings.map((warning) => (
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
        {normalExports.length > 0 ? <NormalExports outputs={normalExports} /> : null}
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
  }
});
