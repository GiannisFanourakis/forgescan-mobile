import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureRotation">;

export function CaptureRotationScreen({
  navigation,
  route
}: Props): ReactElement {
  const {
    addSimulatedFrame,
    completeRotation,
    getProject,
    retakeLastFrame
  } = useProjects();
  const project = getProject(route.params.projectId);
  const rotation = project?.capture.rotations.find(
    (candidate) => candidate.id === route.params.rotationId
  );

  if (!project || !rotation) {
    return (
      <Screen>
        <Text style={styles.title}>Rotation not found</Text>
      </Screen>
    );
  }

  const frameCount = rotation.frames.length;
  const targetFrameCount = project.capture.targetFrameCount;
  const lastFrame = rotation.frames[frameCount - 1];
  const canCapture = frameCount < targetFrameCount;
  const projectId = project.project.id;
  const rotationId = rotation.id;

  function handleCompleteRotation(): void {
    completeRotation(projectId, rotationId);
    navigation.navigate("CapturePlan", { projectId });
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>{rotation.label}</Text>
        <Text style={styles.meta}>{rotation.angleHint}</Text>
      </Section>

      <View style={styles.cameraPlaceholder}>
        <Text style={styles.cameraText}>Camera placeholder</Text>
        <Text style={styles.cameraSubtext}>
          Simulated frames are stored in the manifest.
        </Text>
      </View>

      <Section>
        <View style={styles.counterRow}>
          <Text style={styles.counterLabel}>Frames</Text>
          <Text style={styles.counterValue}>
            {frameCount}/{targetFrameCount}
          </Text>
        </View>
        {lastFrame ? (
          <Text style={styles.lastFrame}>Last frame: {lastFrame.filename}</Text>
        ) : null}
      </Section>

      <Section>
        <Button
          disabled={!canCapture}
          label={canCapture ? "Capture Frame" : "Frame Target Reached"}
          onPress={() => addSimulatedFrame(projectId, rotationId)}
        />
        <Button
          disabled={frameCount === 0}
          label="Retake Last Frame"
          variant="secondary"
          onPress={() => retakeLastFrame(projectId, rotationId)}
        />
        <Button
          disabled={frameCount === 0}
          label="Complete Rotation"
          variant="secondary"
          onPress={handleCompleteRotation}
        />
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
  cameraPlaceholder: {
    alignItems: "center",
    aspectRatio: 3 / 4,
    backgroundColor: "#1f2523",
    borderRadius: 8,
    justifyContent: "center",
    padding: spacing.md
  },
  cameraText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800"
  },
  cameraSubtext: {
    color: "#d9d9d2",
    fontSize: 14,
    marginTop: spacing.xs,
    textAlign: "center"
  },
  counterRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md
  },
  counterLabel: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: "700"
  },
  counterValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800"
  },
  lastFrame: {
    color: colors.mutedText,
    fontSize: 14
  }
});
