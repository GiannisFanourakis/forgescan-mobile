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

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>{project.project.title}</Text>
        <Text style={styles.meta}>
          {project.capture.targetFrameCount} frames per rotation
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
              <Text style={styles.frameCount}>
                {rotation.frames.length}/{project.capture.targetFrameCount} frames
              </Text>
            </View>
            <View style={styles.statusColumn}>
              <StatusPill status={rotation.status} />
              {!rotation.required ? <StatusPill status="optional" /> : null}
            </View>
          </Pressable>
        ))}
      </Section>

      <Button
        label="Review Project"
        variant="secondary"
        onPress={() =>
          navigation.navigate("ProjectReview", {
            projectId: project.project.id
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
    padding: spacing.md
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
  statusColumn: {
    alignItems: "flex-end",
    gap: spacing.xs
  }
});
