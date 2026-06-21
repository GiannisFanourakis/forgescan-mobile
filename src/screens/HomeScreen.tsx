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
  const { projects } = useProjects();

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>ForgeScan</Text>
        <Text style={styles.subtitle}>
          Controlled object capture for future AI/photogrammetry processing.
        </Text>
      </Section>

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
        {projects.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No projects yet</Text>
            <Text style={styles.emptyText}>
              Project persistence is a future storage step.
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
              <Text style={styles.projectMeta}>{project.capture.plan}</Text>
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
    padding: spacing.md
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
  }
});
