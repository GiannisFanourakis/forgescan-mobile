import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Screen, Section } from "../components/Screen";
import { createReconstructionPlan } from "../core/reconstructionPlan";
import { RootStackParamList } from "../navigation/types";
import { getCurrentPlatformEngine } from "../reconstruction/engineRegistry";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ReconstructionPlan">;

export function ReconstructionPlanScreen({ route }: Props): ReactElement {
  const { getProject } = useProjects();
  const project = getProject(route.params.projectId);
  const plan = useMemo(
    () => (project ? createReconstructionPlan(project) : undefined),
    [project]
  );
  const platformJobPlan = useMemo(() => {
    const engine = getCurrentPlatformEngine();
    return project && engine ? engine.createJobPlan(project) : undefined;
  }, [project]);

  if (!project || !plan) {
    return (
      <Screen>
        <Text style={styles.title}>Project not found</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>{plan.projectTitle}</Text>
        <Text style={styles.meta}>
          AI/photogrammetry processing is not implemented in this prototype.
        </Text>
      </Section>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {plan.captureSummary.totalFrames} frames /{" "}
          {plan.captureSummary.completedRotations} completed rotations
        </Text>
        <Text style={styles.summaryMeta}>
          Target exports: {plan.targetFormats.join(", ")}
        </Text>
      </View>

      {platformJobPlan ? (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            Native path: {platformJobPlan.nativeModuleName}
          </Text>
          <Text style={styles.summaryMeta}>
            {platformJobPlan.platform.toUpperCase()} plan only. Real
            reconstruction starts after the native module is implemented.
          </Text>
          <Text style={styles.summaryMeta}>
            Native stages: {platformJobPlan.stages.join(", ")}
          </Text>
        </View>
      ) : null}

      <Section>
        {plan.stages.map((stage) => (
          <View key={stage.id} style={styles.stageRow}>
            <View style={styles.sequenceBadge}>
              <Text style={styles.sequenceText}>{stage.sequence}</Text>
            </View>
            <View style={styles.stageText}>
              <Text style={styles.stageTitle}>{stage.label}</Text>
              <Text style={styles.stageNotes}>{stage.notes}</Text>
              <Text style={styles.stageOutputs}>
                Outputs: {stage.outputs.join(", ")}
              </Text>
            </View>
          </View>
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800"
  },
  meta: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  summary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: spacing.md
  },
  summaryText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800"
  },
  summaryMeta: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  stageRow: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  sequenceBadge: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  sequenceText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  stageText: {
    flex: 1,
    gap: 4
  },
  stageTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  stageNotes: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  stageOutputs: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18
  }
});
