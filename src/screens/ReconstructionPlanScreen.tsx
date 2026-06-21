import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { createReconstructionPlan } from "../core/reconstructionPlan";
import {
  ReconstructionModelId,
  ReconstructionModelStatus
} from "../core/manifest";
import { RootStackParamList } from "../navigation/types";
import { getCurrentPlatformEngine } from "../reconstruction/engineRegistry";
import {
  ReconstructionModelDefinition,
  formatModelRuntime,
  formatModelStatus,
  getSelectedReconstructionModel,
  reconstructionModels
} from "../reconstruction/modelRegistry";
import { useProjects } from "../state/ProjectContext";
import { writeProjectExportJson } from "../storage/projectStorage";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ReconstructionPlan">;

export function ReconstructionPlanScreen({ route }: Props): ReactElement {
  const { getProject, selectReconstructionModel } = useProjects();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const project = getProject(route.params.projectId);
  const plan = useMemo(
    () => (project ? createReconstructionPlan(project) : undefined),
    [project]
  );
  const platformJobPlan = useMemo(() => {
    const engine = getCurrentPlatformEngine();
    return project && engine ? engine.createJobPlan(project) : undefined;
  }, [project]);
  const selectedModel = useMemo(
    () => (project ? getSelectedReconstructionModel(project) : undefined),
    [project]
  );

  if (!project || !plan || !selectedModel) {
    return (
      <Screen>
        <Text style={styles.title}>Project not found</Text>
      </Screen>
    );
  }

  const activeProject = project;

  function handleSelectModel(modelId: ReconstructionModelId): void {
    selectReconstructionModel(activeProject.project.id, modelId);
    setSaveMessage(null);
  }

  function handleSavePlan(): void {
    const uri = writeProjectExportJson(
      activeProject,
      "reconstruction-plan.json",
      JSON.stringify(
        {
          reconstructionPlan: plan,
          selectedAiModel: selectedModel,
          platformJobPlan
        },
        null,
        2
      )
    );
    setSaveMessage(`Reconstruction plan saved: ${uri}`);
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>{plan.projectTitle}</Text>
        <Text style={styles.meta}>
          Capture package staged for reconstruction processing.
        </Text>
      </Section>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {plan.captureSummary.totalFrames} frames /{" "}
          {plan.captureSummary.completedRotations} completed rotations
        </Text>
        <Text style={styles.summaryMeta}>
          {plan.captureSummary.totalVideos} videos /{" "}
          Target exports: {plan.targetFormats.join(", ")}
        </Text>
      </View>

      <Section>
        <Text style={styles.sectionTitle}>AI reconstruction model</Text>
        <Text style={styles.meta}>
          Choose the model path before exporting the reconstruction plan.
        </Text>
        {reconstructionModels.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            selected={model.id === selectedModel.id}
            onPress={() => handleSelectModel(model.id)}
          />
        ))}
      </Section>

      {platformJobPlan ? (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            Native path: {platformJobPlan.nativeModuleName}
          </Text>
          <Text style={styles.summaryMeta}>
            AI model: {platformJobPlan.aiModel.label}
          </Text>
          <Text style={styles.summaryMeta}>
            {platformJobPlan.platform.toUpperCase()} native engine track.
          </Text>
          <Text style={styles.summaryMeta}>
            Native stages: {platformJobPlan.stages.join(", ")}
          </Text>
        </View>
      ) : null}

      <Section>
        <Button
          label="Save Reconstruction Plan"
          variant="secondary"
          onPress={handleSavePlan}
        />
        {saveMessage ? (
          <Text style={styles.savedMessage}>{saveMessage}</Text>
        ) : null}
      </Section>

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

interface ModelCardProps {
  model: ReconstructionModelDefinition;
  selected: boolean;
  onPress: () => void;
}

function ModelCard({
  model,
  selected,
  onPress
}: ModelCardProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.modelCard,
        selected ? styles.modelCardSelected : undefined,
        pressed ? styles.modelCardPressed : undefined
      ]}
    >
      <View style={styles.modelHeader}>
        <View style={styles.modelTitleGroup}>
          <Text style={styles.modelTitle}>{model.label}</Text>
          <Text style={styles.modelMeta}>
            {formatModelRuntime(model.runtime)} / {model.engine}
          </Text>
        </View>
        <View style={[styles.modelBadge, getModelBadgeStyle(model.status)]}>
          <Text style={styles.modelBadgeText}>
            {selected ? "selected" : formatModelStatus(model.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.modelSummary}>{model.summary}</Text>
      <Text style={styles.modelDetail}>
        Inputs: {model.inputTypes.join(", ")} / Recommended:{" "}
        {model.recommendedFrames} frames
      </Text>
      <Text style={styles.modelDetail}>
        Status: {formatModelStatus(model.status)}
      </Text>
      <Text style={styles.modelDetail}>
        Outputs: {model.targetFormats.join(", ")}
      </Text>
    </Pressable>
  );
}

function getModelBadgeStyle(
  status: ReconstructionModelStatus
): { backgroundColor: string } {
  switch (status) {
    case "capture-ready":
    case "external-ready":
      return { backgroundColor: "#d9eadf" };
    case "requires-native-build":
      return { backgroundColor: "#efe5d2" };
    case "planned":
      return { backgroundColor: "#dfece8" };
  }
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
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
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
  modelCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  modelCardSelected: {
    borderColor: colors.accent,
    borderWidth: 2
  },
  modelCardPressed: {
    opacity: 0.86
  },
  modelHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  modelTitleGroup: {
    flex: 1,
    gap: 2
  },
  modelTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  modelMeta: {
    color: colors.mutedText,
    fontSize: 13,
    textTransform: "capitalize"
  },
  modelSummary: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  modelDetail: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18
  },
  modelBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    maxWidth: 128,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  modelBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    textTransform: "capitalize"
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
  },
  savedMessage: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    padding: spacing.md
  }
});
