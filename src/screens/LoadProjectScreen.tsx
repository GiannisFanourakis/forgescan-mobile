import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { ForgeScanLogo } from "../components/ForgeScanLogo";
import { Screen, Section } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "LoadProject">;

export function LoadProjectScreen({ navigation }: Props): ReactElement {
  const { isLoadingProjects, projects, storageError } = useProjects();

  return (
    <Screen>
      <Section>
        <View style={styles.header}>
          <ForgeScanLogo size={58} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Load scan</Text>
            <Text style={styles.meta}>{projects.length} saved projects</Text>
          </View>
        </View>
      </Section>

      {storageError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Storage unavailable</Text>
          <Text style={styles.emptyText}>{storageError}</Text>
        </View>
      ) : null}

      {isLoadingProjects ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Loading projects</Text>
          <Text style={styles.emptyText}>Reading local scan manifests.</Text>
        </View>
      ) : projects.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No saved scans</Text>
          <Text style={styles.emptyText}>
            Start a capture to create the first local project.
          </Text>
          <Button
            label="Start Capture"
            onPress={() => navigation.navigate("NewProject")}
          />
        </View>
      ) : (
        <Section>
          {projects.map((project) => (
            <Pressable
              accessibilityRole="button"
              key={project.project.id}
              onPress={() =>
                navigation.navigate("CapturePlan", {
                  projectId: project.project.id
                })
              }
              style={({ pressed }) => [
                styles.projectRow,
                pressed ? styles.pressed : undefined
              ]}
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
          ))}
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md
  },
  headerText: {
    flex: 1,
    gap: 3
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900"
  },
  meta: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: "700"
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800"
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
    fontWeight: "800"
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
    fontWeight: "900"
  },
  pressed: {
    opacity: 0.78
  }
});
