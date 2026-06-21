import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CameraCapturedPicture, CameraView, useCameraPermissions } from "expo-camera";
import type { ReactElement } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useRef, useState } from "react";

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
    addCapturedFrame,
    completeRotation,
    getProject,
    retakeLastFrame
  } = useProjects();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
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

  const activeRotation = rotation;
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

  async function handleCaptureFrame(): Promise<void> {
    if (!cameraRef.current || !canCapture || isCapturing) {
      return;
    }

    setIsCapturing(true);
    setCaptureError(null);

    try {
      const photo: CameraCapturedPicture =
        await cameraRef.current.takePictureAsync({
          quality: 0.92,
          skipProcessing: false
        });

      await addCapturedFrame(projectId, rotationId, {
        uri: photo.uri,
        width: photo.width,
        height: photo.height
      });
    } catch (error: unknown) {
      setCaptureError(
        error instanceof Error ? error.message : "Frame capture failed."
      );
    } finally {
      setIsCapturing(false);
    }
  }

  function renderCamera(): ReactElement {
    if (!permission) {
      return (
        <View style={styles.cameraPanel}>
          <Text style={styles.cameraTitle}>Preparing camera</Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.cameraPanel}>
          <Text style={styles.cameraTitle}>Camera access needed</Text>
          <Text style={styles.cameraText}>
            ForgeScan stores captured frames locally in this project.
          </Text>
          <Button label="Grant Camera Access" onPress={requestPermission} />
        </View>
      );
    }

    return (
      <View style={styles.cameraShell}>
        <CameraView ref={cameraRef} facing="back" style={styles.cameraView} />
        <View pointerEvents="none" style={styles.cameraOverlay}>
          <View style={styles.guideCircle} />
          <View style={styles.guideLineHorizontal} />
          <View style={styles.guideLineVertical} />
          <View style={styles.overlayTop}>
            <Text style={styles.overlayTitle}>{activeRotation.label}</Text>
            <Text style={styles.overlayMeta}>
              {frameCount}/{targetFrameCount} frames
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>{rotation.label}</Text>
        <Text style={styles.meta}>{rotation.angleHint}</Text>
      </Section>

      {renderCamera()}

      <Section>
        <View style={styles.counterRow}>
          <Text style={styles.counterLabel}>Frames</Text>
          <Text style={styles.counterValue}>
            {frameCount}/{targetFrameCount}
          </Text>
        </View>
        {lastFrame ? (
          <View style={styles.lastFrameRow}>
            <Image source={{ uri: lastFrame.uri }} style={styles.thumbnail} />
            <View style={styles.lastFrameText}>
              <Text style={styles.lastFrameTitle}>{lastFrame.filename}</Text>
              <Text style={styles.lastFrameMeta}>
                {lastFrame.width ?? "?"} x {lastFrame.height ?? "?"}
              </Text>
            </View>
          </View>
        ) : null}
        {captureError ? (
          <Text style={styles.errorMessage}>{captureError}</Text>
        ) : null}
      </Section>

      <Section>
        <Button
          disabled={!canCapture || isCapturing || !permission?.granted}
          label={
            canCapture
              ? isCapturing
                ? "Capturing"
                : "Capture Frame"
              : "Frame Target Reached"
          }
          onPress={handleCaptureFrame}
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
  cameraShell: {
    aspectRatio: 3 / 4,
    backgroundColor: colors.text,
    borderRadius: 8,
    overflow: "hidden"
  },
  cameraView: {
    flex: 1
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  overlayTop: {
    backgroundColor: "rgba(20, 27, 25, 0.68)",
    borderRadius: 8,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: "absolute",
    right: spacing.md,
    top: spacing.md
  },
  overlayTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  },
  overlayMeta: {
    color: "#dfece8",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2
  },
  guideCircle: {
    borderColor: "rgba(255, 255, 255, 0.88)",
    borderRadius: 999,
    borderWidth: 2,
    height: "54%",
    width: "72%"
  },
  guideLineHorizontal: {
    backgroundColor: "rgba(255, 255, 255, 0.45)",
    height: 1,
    position: "absolute",
    width: "76%"
  },
  guideLineVertical: {
    backgroundColor: "rgba(255, 255, 255, 0.45)",
    height: "58%",
    position: "absolute",
    width: 1
  },
  cameraPanel: {
    alignItems: "center",
    aspectRatio: 3 / 4,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: "center",
    padding: spacing.md
  },
  cameraTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800"
  },
  cameraText: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
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
  lastFrameRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm
  },
  thumbnail: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 6,
    height: 56,
    width: 56
  },
  lastFrameText: {
    flex: 1,
    gap: 2
  },
  lastFrameTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  lastFrameMeta: {
    color: colors.mutedText,
    fontSize: 14
  },
  errorMessage: {
    backgroundColor: "#f0d8d5",
    borderRadius: 8,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    padding: spacing.md
  }
});
