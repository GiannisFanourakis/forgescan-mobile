import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import {
  FullReconstructionRunReport,
  FullRunStageResult,
  FullRunStageStatus,
  createInitialFullRunStages,
  runFullReconstructionTest
} from "../reconstruction/fullRun";
import { getSelectedReconstructionModel } from "../reconstruction/modelRegistry";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "FullReconstructionRun">;

export function FullReconstructionRunScreen({
  route
}: Props): ReactElement {
  const { getProject } = useProjects();
  const project = getProject(route.params.projectId);
  const [stages, setStages] = useState<FullRunStageResult[]>(
    createInitialFullRunStages
  );
  const [report, setReport] = useState<FullReconstructionRunReport | null>(
    null
  );
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const model = useMemo(
    () => (project ? getSelectedReconstructionModel(project) : undefined),
    [project]
  );

  if (!project || !model) {
    return (
      <Screen>
        <Text style={styles.title}>Project not found</Text>
      </Screen>
    );
  }

  async function handleRun(): Promise<void> {
    if (!project) {
      return;
    }

    setIsRunning(true);
    setRunError(null);
    setReport(null);
    setStages(createInitialFullRunStages());

    try {
      const nextReport = await runFullReconstructionTest(project, (stage) => {
        setStages((currentStages) => replaceStage(currentStages, stage));
      });
      setReport(nextReport);
    } catch (error: unknown) {
      setRunError(
        error instanceof Error
          ? error.message
          : "Unable to complete the reconstruction test."
      );
    } finally {
      setIsRunning(false);
    }
  }

  const completedCount = stages.filter(
    (stage) => stage.status === "complete" || stage.status === "warning"
  ).length;

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>Full reconstruction test</Text>
        <Text style={styles.meta}>{project.project.title}</Text>
      </Section>

      <View style={styles.summary}>
        <View style={styles.summaryText}>
          <Text style={styles.summaryTitle}>{model.label}</Text>
          <Text style={styles.summaryMeta}>
            {project.capture.rotations.reduce(
              (sum, rotation) => sum + rotation.frames.length,
              0
            )}{" "}
            frames / {model.engine}
          </Text>
        </View>
        <StageBadge status={report?.status ?? (isRunning ? "running" : "pending")} />
      </View>

      <Section>
        <Button
          label={isRunning ? "Running Full Test" : "Run Full Reconstruction Test"}
          disabled={isRunning}
          onPress={() => {
            void handleRun();
          }}
        />
        <Text style={styles.progressText}>
          {completedCount}/{stages.length} stages completed
        </Text>
      </Section>

      {runError ? (
        <Text style={[styles.message, styles.error]}>{runError}</Text>
      ) : null}

      <Section>
        {stages.map((stage) => (
          <View key={stage.id} style={styles.stageRow}>
            <View style={styles.stageText}>
              <Text style={styles.stageTitle}>{stage.label}</Text>
              <Text style={styles.stageDetail}>{stage.detail}</Text>
              {stage.outputs.length > 0 ? (
                <Text style={styles.stageOutputs}>
                  Outputs: {stage.outputs.join(", ")}
                </Text>
              ) : null}
              {stage.warnings.map((warning) => (
                <Text key={warning} style={styles.warningText}>
                  {warning}
                </Text>
              ))}
            </View>
            <StageBadge status={stage.status} />
          </View>
        ))}
      </Section>

      {report ? (
        <Section>
          <Text style={styles.sectionTitle}>Generated artifacts</Text>
          <Text style={styles.message}>
            Report saved:{" "}
            {report.artifacts.find((artifact) => artifact.kind === "report")
              ?.uri ?? "exports/full-run-report.json"}
          </Text>
          {report.artifacts.map((artifact) => (
            <View key={`${artifact.filename}-${artifact.uri}`} style={styles.artifactRow}>
              <View style={styles.stageText}>
                <Text style={styles.stageTitle}>{artifact.filename}</Text>
                <Text style={styles.stageDetail}>{artifact.uri}</Text>
              </View>
              <Text style={styles.artifactMeta}>{artifact.format}</Text>
            </View>
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function replaceStage(
  stages: FullRunStageResult[],
  stageUpdate: FullRunStageResult
): FullRunStageResult[] {
  return stages.map((stage) =>
    stage.id === stageUpdate.id ? stageUpdate : stage
  );
}

interface StageBadgeProps {
  status: FullRunStageStatus | FullReconstructionRunReport["status"];
}

function StageBadge({ status }: StageBadgeProps): ReactElement {
  return (
    <View style={[styles.badge, getBadgeStyle(status)]}>
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
}

function getBadgeStyle(
  status: StageBadgeProps["status"]
): { backgroundColor: string } {
  switch (status) {
    case "complete":
      return { backgroundColor: "#d9eadf" };
    case "running":
      return { backgroundColor: "#dfece8" };
    case "warning":
      return { backgroundColor: "#efe5d2" };
    case "blocked":
      return { backgroundColor: "#f0d8d5" };
    case "pending":
      return { backgroundColor: colors.surfaceMuted };
  }
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
  summary: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.md
  },
  summaryText: {
    flex: 1,
    gap: 3
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900"
  },
  summaryMeta: {
    color: colors.mutedText,
    fontSize: 13,
    textTransform: "capitalize"
  },
  progressText: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center"
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  stageRow: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.md
  },
  stageText: {
    flex: 1,
    gap: 4
  },
  stageTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  stageDetail: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18
  },
  stageOutputs: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18
  },
  warningText: {
    color: colors.warning,
    fontSize: 12,
    lineHeight: 18
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    maxWidth: 110,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  badgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "capitalize"
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
  error: {
    borderColor: colors.danger,
    color: colors.danger
  },
  artifactRow: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.md
  },
  artifactMeta: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  }
});
