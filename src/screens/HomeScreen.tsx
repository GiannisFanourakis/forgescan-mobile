import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props): ReactElement {
  const { isLoadingProjects, projects, storageError } = useProjects();

  return (
    <Screen>
      <View style={styles.hero}>
        <View>
          <Text style={styles.title}>ForgeScan</Text>
          <Text style={styles.subtitle}>Guided object capture</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{projects.length}</Text>
          <Text style={styles.statLabel}>Projects</Text>
        </View>
      </View>

      <Button
        label="New Scan"
        onPress={() => navigation.navigate("NewProject")}
      />
      <Button
        label="Android and iOS Support"
        variant="secondary"
        onPress={() => navigation.navigate("DeviceSupport")}
      />

      <Section>
        <Text style={styles.sectionTitle}>Local projects</Text>
        {storageError ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Storage unavailable</Text>
            <Text style={styles.emptyText}>{storageError}</Text>
          </View>
        ) : null}
        {isLoadingProjects ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Loading projects</Text>
            <Text style={styles.emptyText}>
              Reading saved manifests from local device storage.
            </Text>
          </View>
        ) : projects.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No projects yet</Text>
            <Text style={styles.emptyText}>
              Create a scan to start a local capture package.
            </Text>
          </View>
        ) : (
          projects.map((project) => (
            <Pressable
              accessibilityRole="button"
              key={project.project.id}
              onPress={() =>
                navigation.navigate("CapturePlan", {
                  projectId: project.project.id
                })
              }
              style={styles.projectRow}
            >
              <View style={styles.projectRowText}>
                <Text style={styles.projectTitle}>{project.project.title}</Text>
                <Text style={styles.projectMeta}>
                  {project.capture.targetFrameCount} frames per rotation
                </Text>
              </View>
              <View style={styles.planBadge}>
                <Text style={styles.planBadgeText}>
                  {project.capture.plan === "three-rotation" ? "3 rot" : "2 rot"}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 16,
    lineHeight: 23
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  hero: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2
  },
  statBlock: {
    alignItems: "center",
    backgroundColor: "#dfece8",
    borderRadius: 8,
    minWidth: 78,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  statValue: {
    color: colors.accent,
    fontSize: 24,
    fontWeight: "800"
  },
  statLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700"
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  projectRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 1
  },
  projectRowText: {
    flex: 1,
    gap: 2
  },
  projectTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700"
  },
  projectMeta: {
    color: colors.mutedText,
    fontSize: 13
  },
  planBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  planBadgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800"
  }
});
