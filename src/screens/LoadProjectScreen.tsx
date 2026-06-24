import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { ForgeScanLogo } from "../components/ForgeScanLogo";
import { Screen, Section } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import { pickNativeVideo } from "../native/NativeMediaPicker";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "LoadProject">;

export function LoadProjectScreen({ navigation }: Props): ReactElement {
  const {
    deleteProject,
    importClipProject,
    isLoadingProjects,
    projects,
    storageError
  } =
    useProjects();
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function loadClipFromDevice(): Promise<void> {
    setImportError(null);
    setIsImporting(true);

    try {
      const pickedVideo = await pickNativeVideo();

      if (pickedVideo.status === "cancelled") {
        return;
      }

      if (pickedVideo.status !== "selected" || !pickedVideo.uri) {
        setImportError(
          pickedVideo.errors[0] ??
            "The selected clip could not be loaded from this device."
        );
        return;
      }

      const project = await importClipProject(
        createProjectTitleFromFilename(pickedVideo.filename),
        {
          uri: pickedVideo.uri
        }
      );

      navigation.navigate("CapturePlan", {
        projectId: project.project.id
      });
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "The clip could not be imported."
      );
    } finally {
      setIsImporting(false);
    }
  }

  function confirmDeleteProject(projectId: string, title: string): void {
    Alert.alert(
      "Delete scan",
      `Delete "${title}" and its local files?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteProject(projectId)
        }
      ]
    );
  }

  return (
    <Screen>
      <Section>
        <View style={styles.header}>
          <ForgeScanLogo size={58} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Load clip</Text>
            <Text style={styles.meta}>{projects.length} saved</Text>
          </View>
        </View>
        <View style={styles.importActions}>
          <Button
            disabled={isImporting}
            label={isImporting ? "Loading..." : "Load Clip from Device"}
            onPress={() => {
              void loadClipFromDevice();
            }}
          />
          <Text style={styles.importHint}>
            Pick a video already captured with your phone camera.
          </Text>
          {importError ? (
            <Text style={styles.errorText}>{importError}</Text>
          ) : null}
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
          <Text style={styles.emptyTitle}>No saved clips</Text>
          <Text style={styles.emptyText}>
            Load a video from your device or create a new clip.
          </Text>
          <Button
            disabled={isImporting}
            label={isImporting ? "Loading..." : "Load Clip from Device"}
            onPress={() => {
              void loadClipFromDevice();
            }}
          />
          <Button
            label="Create New Clip"
            onPress={() => navigation.navigate("NewProject")}
            variant="secondary"
          />
        </View>
      ) : (
        <Section>
          {projects.map((project) => (
            <View
              key={project.project.id}
              style={styles.projectRow}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  navigation.navigate("CapturePlan", {
                    projectId: project.project.id
                  })
                }
                style={({ pressed }) => [
                  styles.projectOpenArea,
                  pressed ? styles.pressed : undefined
                ]}
              >
                <View style={styles.projectRowText}>
                  <Text style={styles.projectTitle}>{project.project.title}</Text>
                  <Text style={styles.projectMeta}>
                    Video turntable scan · {project.capture.rotations.reduce(
                      (sum, rotation) => sum + (rotation.videos?.length ?? 0),
                      0
                    )} clips
                  </Text>
                </View>
                <View style={styles.planBadge}>
                  <Text style={styles.planBadgeText}>
                    {project.capture.plan === "three-rotation" ? "3 rot" : "2 rot"}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  confirmDeleteProject(
                    project.project.id,
                    project.project.title
                  )
                }
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed ? styles.pressed : undefined
                ]}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            </View>
          ))}
        </Section>
      )}
    </Screen>
  );
}

function createProjectTitleFromFilename(filename: string | undefined): string {
  if (!filename) {
    return "Imported clip";
  }

  const withoutExtension = filename.replace(/\.[^/.]+$/, "");
  const readableTitle = withoutExtension.replace(/[_-]+/g, " ").trim();
  return readableTitle.length > 0 ? readableTitle : "Imported clip";
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
  importActions: {
    gap: spacing.sm,
    marginTop: spacing.md
  },
  importHint: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
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
  projectOpenArea: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
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
  deleteButton: {
    backgroundColor: "#f0d8d5",
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "900"
  },
  pressed: {
    opacity: 0.78
  }
});
