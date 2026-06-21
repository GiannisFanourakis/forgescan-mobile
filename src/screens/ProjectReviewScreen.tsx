import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { StatusPill } from "../components/StatusPill";
import {
  createExportTargetPlan,
  exportTargetPlanJson
} from "../core/exportTargets";
import { validateProjectForReconstruction } from "../core/frameValidation";
import { exportProjectManifestJson } from "../core/projectPackage";
import { RootStackParamList } from "../navigation/types";
import {
  formatModelRuntime,
  formatModelStatus,
  getSelectedReconstructionModel
} from "../reconstruction/modelRegistry";
import { useProjects } from "../state/ProjectContext";
import {
  getProjectStoragePaths,
  writeProjectExportJson,
  writeProjectManifestJson
} from "../storage/projectStorage";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ProjectReview">;

export function ProjectReviewScreen({
  navigation,
  route
}: Props): ReactElement {
  const { getProject } = useProjects();
  const [manifestJson, setManifestJson] = useState<string | null>(null);
  const [exportPlanJson, setExportPlanJson] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const project = getProject(route.params.projectId);

  const validation = useMemo(
    () => (project ? validateProjectForReconstruction(project) : undefined),
    [project]
  );
  const exportTargetPlan = useMemo(
    () => (project ? createExportTargetPlan(project) : undefined),
    [project]
  );
  const storagePaths = useMemo(
    () => (project ? getProjectStoragePaths(project) : undefined),
    [project]
  );
  const reconstructionModel = useMemo(
    () => (project ? getSelectedReconstructionModel(project) : undefined),
    [project]
  );

  if (
    !project ||
    !validation ||
    !exportTargetPlan ||
    !storagePaths ||
    !reconstructionModel
  ) {
    return (
      <Screen>
        <Text style={styles.title}>Project not found</Text>
      </Screen>
    );
  }

  const activeProject = project;

  function handleExportManifest(): void {
    const json = exportProjectManifestJson(activeProject);
    const uri = writeProjectManifestJson(activeProject, json);
    setManifestJson(json);
    setExportMessage(`Manifest saved: ${uri}`);
  }

  function handleExportTargetPlan(): void {
    const json = exportTargetPlanJson(activeProject);
    const uri = writeProjectExportJson(
      activeProject,
      "export-targets.json",
      json
    );
    setExportPlanJson(json);
    setExportMessage(`3D format plan saved: ${uri}`);
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>{activeProject.project.title}</Text>
        <Text style={styles.meta}>
          {activeProject.capture.mode} / {activeProject.capture.plan}
        </Text>
      </Section>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Validation</Text>
        <StatusPill
          status={validation.validForReconstruction ? "ready" : "blocked"}
        />
      </View>

      <Section>
        <Text style={styles.sectionTitle}>Rotations</Text>
        {activeProject.capture.rotations.map((rotation) => (
          <View key={rotation.id} style={styles.rotationSummary}>
            <View style={styles.rotationText}>
              <Text style={styles.rotationTitle}>{rotation.label}</Text>
              <Text style={styles.rotationMeta}>
                {rotation.frames.length}/{activeProject.capture.targetFrameCount} frames
              </Text>
            </View>
            <StatusPill status={rotation.status} />
          </View>
        ))}
      </Section>

      <Section>
        <Text style={styles.sectionTitle}>Validation messages</Text>
        {validation.errors.length === 0 && validation.warnings.length === 0 ? (
          <Text style={styles.message}>No validation messages.</Text>
        ) : null}
        {validation.errors.map((error) => (
          <Text key={error} style={[styles.message, styles.error]}>
            {error}
          </Text>
        ))}
        {validation.warnings.map((warning) => (
          <Text key={warning} style={[styles.message, styles.warning]}>
            {warning}
          </Text>
        ))}
      </Section>

      <Section>
        <Text style={styles.sectionTitle}>Local package</Text>
        <Text style={styles.message}>
          Project folder: {storagePaths.projectUri}
        </Text>
        <Text style={styles.message}>
          Manifest file: {storagePaths.manifestUri}
        </Text>
        <Text style={styles.message}>
          Exports folder: {storagePaths.exportsUri}
        </Text>
      </Section>

      <Section>
        <Text style={styles.sectionTitle}>AI reconstruction model</Text>
        <View style={styles.modelSummary}>
          <View style={styles.rotationText}>
            <Text style={styles.rotationTitle}>
              {reconstructionModel.label}
            </Text>
            <Text style={styles.rotationMeta}>
              {formatModelRuntime(reconstructionModel.runtime)} /{" "}
              {reconstructionModel.engine}
            </Text>
          </View>
          <View style={styles.modelBadge}>
            <Text style={styles.modelBadgeText}>
              {formatModelStatus(reconstructionModel.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.message}>{reconstructionModel.summary}</Text>
      </Section>

      <Section>
        <Text style={styles.sectionTitle}>3D export formats</Text>
        <Text style={styles.message}>
          Actual 3D files are produced after reconstruction processing.
        </Text>
        {exportTargetPlan.artifacts.map((artifact) => (
          <View key={artifact.format} style={styles.exportRow}>
            <View style={styles.rotationText}>
              <Text style={styles.rotationTitle}>
                {artifact.format.toUpperCase()} - {artifact.label}
              </Text>
              <Text style={styles.rotationMeta}>{artifact.path}</Text>
            </View>
            <StatusPill status="ready" />
          </View>
        ))}
      </Section>

      <Section>
        <Button
          label="Run Full Reconstruction Test"
          onPress={() =>
            navigation.navigate("FullReconstructionRun", {
              projectId: activeProject.project.id
            })
          }
        />
        <Button
          label="Prepare Reconstruction Plan"
          variant="secondary"
          onPress={() =>
            navigation.navigate("ReconstructionPlan", {
              projectId: activeProject.project.id
            })
          }
        />
        <Button
          label="Export Project Manifest"
          variant="secondary"
          onPress={handleExportManifest}
        />
        <Button
          label="Export 3D Format Plan"
          variant="secondary"
          onPress={handleExportTargetPlan}
        />
      </Section>

      {exportMessage ? (
        <Text style={styles.message}>{exportMessage}</Text>
      ) : null}

      {manifestJson ? (
        <Section>
          <Text style={styles.sectionTitle}>Manifest JSON</Text>
          <Text selectable style={styles.jsonBlock}>
            {manifestJson}
          </Text>
        </Section>
      ) : null}

      {exportPlanJson ? (
        <Section>
          <Text style={styles.sectionTitle}>3D Format Plan JSON</Text>
          <Text selectable style={styles.jsonBlock}>
            {exportPlanJson}
          </Text>
        </Section>
      ) : null}
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
    fontSize: 14
  },
  summaryRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md
  },
  summaryLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  rotationSummary: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md
  },
  exportRow: {
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
  modelSummary: {
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
  modelBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#efe5d2",
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
  rotationText: {
    flex: 1,
    gap: 2
  },
  rotationTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  rotationMeta: {
    color: colors.mutedText,
    fontSize: 13
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
  warning: {
    borderColor: colors.warning,
    color: colors.warning
  },
  jsonBlock: {
    backgroundColor: "#242925",
    borderRadius: 8,
    color: "#f7f7f4",
    fontFamily: "Courier",
    fontSize: 12,
    lineHeight: 18,
    padding: spacing.md
  }
});
