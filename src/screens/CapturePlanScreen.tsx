import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { StatusPill } from "../components/StatusPill";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "CapturePlan">;

export function CapturePlanScreen({ navigation, route }: Props): ReactElement {
  const { getProject, startRotation } = useProjects();
  const project = getProject(route.params.projectId);

  if (!project) {
    return (
      <Screen>
        <Text style={styles.title}>Project not found</Text>
      </Screen>
    );
  }

  const fullCoverageComplete = project.capture.rotations.every((rotation) => {
    if (!rotation.required) {
      return true;
    }

    return rotation.status === "complete" && (rotation.videos?.length ?? 0) > 0;
  });
  const hasAnyClip = project.capture.rotations.some(
    (rotation) => (rotation.videos?.length ?? 0) > 0
  );

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>{project.project.title}</Text>
        <Text style={styles.meta}>
          One smooth full-turn clip is enough to start. More angles improve coverage.
        </Text>
      </Section>

      <Section>
        {project.capture.rotations.map((rotation) => (
          <Pressable
            accessibilityRole="button"
            key={rotation.id}
            onPress={() => {
              startRotation(project.project.id, rotation.id);
              navigation.navigate("CaptureRotation", {
                projectId: project.project.id,
                rotationId: rotation.id
              });
            }}
            style={styles.rotationRow}
          >
            <View style={styles.rotationText}>
              <Text style={styles.rotationTitle}>{rotation.label}</Text>
              <Text style={styles.rotationHint}>{rotation.angleHint}</Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(
                        100,
                        ((rotation.videos?.length ?? 0) > 0 ? 100 : 0)
                      )}%`
                    }
                  ]}
                />
              </View>
              <Text style={styles.frameCount}>
                {(rotation.videos?.length ?? 0)} video
                {(rotation.videos?.length ?? 0) === 1 ? "" : "s"}
              </Text>
              {(rotation.videos?.length ?? 0) === 0 ? (
                <Text style={styles.coverageWarning}>
                  {hasAnyClip
                    ? "Optional: add this angle for better coverage."
                    : "Record or load one clip to start."}
                </Text>
              ) : null}
            </View>
            <View style={styles.statusColumn}>
              <StatusPill status={rotation.status} />
              {!rotation.required ? <StatusPill status="optional" /> : null}
            </View>
          </Pressable>
        ))}
      </Section>

      <Button
        label={hasAnyClip ? "Process Clip" : "Review Clips"}
        variant={hasAnyClip ? "primary" : "secondary"}
        onPress={() =>
          navigation.navigate("ProjectReview", {
            projectId: project.project.id,
            autoProcess: hasAnyClip
          })
        }
      />
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
  rotationRow: {
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 1
  },
  rotationText: {
    flex: 1,
    gap: 4
  },
  rotationTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800"
  },
  rotationHint: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  frameCount: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700"
  },
  coverageWarning: {
    color: colors.warning,
    fontSize: 12,
    lineHeight: 17
  },
  progressTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    height: 7,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 7
  },
  statusColumn: {
    alignItems: "flex-end",
    gap: spacing.xs
  }
});
