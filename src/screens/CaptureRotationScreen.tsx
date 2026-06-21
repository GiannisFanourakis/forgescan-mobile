import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import type { ReactElement } from "react";
import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureRotation">;
type ToolbarMenu = "capture" | "frames" | "actions";

const toolbarMenus: { label: string; value: ToolbarMenu }[] = [
  { label: "Capture", value: "capture" },
  { label: "Frames", value: "frames" },
  { label: "Actions", value: "actions" }
];

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
  const [activeMenu, setActiveMenu] = useState<ToolbarMenu>("capture");
  const [isLaunchingCamera, setIsLaunchingCamera] = useState(false);
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

  const frameCount = rotation.frames.length;
  const targetFrameCount = project.capture.targetFrameCount;
  const lastFrame = rotation.frames[frameCount - 1];
  const remainingFrames = Math.max(0, targetFrameCount - frameCount);
  const progressPercent =
    targetFrameCount > 0 ? Math.min(100, (frameCount / targetFrameCount) * 100) : 0;
  const canCapture = remainingFrames > 0;
  const projectId = project.project.id;
  const rotationId = rotation.id;
  const nextFrameNumber = Math.min(frameCount + 1, targetFrameCount);

  async function handleOpenSystemCamera(): Promise<void> {
    if (!canCapture || isLaunchingCamera) {
      return;
    }

    setCaptureError(null);
    setIsLaunchingCamera(true);

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        setCaptureError("System camera access was denied.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        cameraType: ImagePicker.CameraType.back,
        exif: true,
        mediaTypes: ["images"],
        quality: 1
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      await addCapturedFrame(projectId, rotationId, {
        uri: result.assets[0].uri,
        ...(result.assets[0].width > 0 ? { width: result.assets[0].width } : {}),
        ...(result.assets[0].height > 0
          ? { height: result.assets[0].height }
          : {})
      });
    } catch (error: unknown) {
      setCaptureError(
        error instanceof Error
          ? error.message
          : "System camera capture failed."
      );
    } finally {
      setIsLaunchingCamera(false);
    }
  }

  function handleRetakeLastFrame(): void {
    retakeLastFrame(projectId, rotationId);
  }

  function handleCompleteRotation(): void {
    completeRotation(projectId, rotationId);
    navigation.navigate("CapturePlan", { projectId });
  }

  return (
    <SafeAreaView style={styles.screenRoot}>
      <View style={styles.topBar}>
        <View style={styles.titleGroup}>
          <Text style={styles.eyebrow}>{project.project.title}</Text>
          <Text style={styles.title}>{rotation.label}</Text>
        </View>
        <View style={styles.frameBadge}>
          <Text style={styles.frameBadgeValue}>{frameCount}</Text>
          <Text style={styles.frameBadgeLabel}>Frames</Text>
        </View>
      </View>

      <View style={styles.previewShell}>
        <View style={styles.previewGrid}>
          <View style={styles.previewGuide} />
          <View style={styles.previewLineHorizontal} />
          <View style={styles.previewLineVertical} />
          <View style={styles.previewCornerTopLeft} />
          <View style={styles.previewCornerTopRight} />
          <View style={styles.previewCornerBottomLeft} />
          <View style={styles.previewCornerBottomRight} />
        </View>

        <View style={styles.previewStatusBar}>
          <Text style={styles.previewStatusLabel}>Frame {nextFrameNumber}</Text>
          <Text style={styles.previewStatusValue}>
            {frameCount}/{targetFrameCount}
          </Text>
        </View>
      </View>

      <View style={styles.toolbar}>
        {toolbarMenus.map((menu) => (
          <Pressable
            accessibilityRole="button"
            key={menu.value}
            onPress={() => setActiveMenu(menu.value)}
            style={({ pressed }) => [
              styles.toolbarItem,
              activeMenu === menu.value ? styles.toolbarItemActive : undefined,
              pressed ? styles.pressed : undefined
            ]}
          >
            <Text
              style={[
                styles.toolbarText,
                activeMenu === menu.value ? styles.toolbarTextActive : undefined
              ]}
            >
              {menu.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>{rotation.angleHint}</Text>
            <Text style={styles.progressMeta}>{remainingFrames} remaining</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>

        {activeMenu === "capture" ? (
          <View style={styles.menuPanel}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>System Camera</Text>
              <Text style={styles.menuMeta}>OEM camera app</Text>
            </View>
            <Button
              disabled={!canCapture || isLaunchingCamera}
              label={
                canCapture
                  ? isLaunchingCamera
                    ? "Opening Camera"
                    : "Open Camera"
                  : "Frame Target Reached"
              }
              onPress={handleOpenSystemCamera}
            />
            {lastFrame ? (
              <View style={styles.lastFrameCard}>
                <Image source={{ uri: lastFrame.uri }} style={styles.thumbnail} />
                <View style={styles.lastFrameText}>
                  <Text style={styles.lastFrameTitle}>{lastFrame.filename}</Text>
                  <Text style={styles.lastFrameMeta}>
                    {lastFrame.width ?? "?"} x {lastFrame.height ?? "?"}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {activeMenu === "frames" ? (
          <View style={styles.menuPanel}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Frames</Text>
              <Text style={styles.menuMeta}>{frameCount} captured</Text>
            </View>
            {rotation.frames.length === 0 ? (
              <View style={styles.emptyFrameList}>
                <Text style={styles.emptyFrameText}>No frames captured</Text>
              </View>
            ) : (
              <View style={styles.frameStrip}>
                {rotation.frames.slice(-8).map((frame) => (
                  <View key={frame.filename} style={styles.frameTile}>
                    <Image source={{ uri: frame.uri }} style={styles.frameTileImage} />
                    <Text style={styles.frameTileLabel}>{frame.index}</Text>
                  </View>
                ))}
              </View>
            )}
            <Button
              disabled={frameCount === 0 || isLaunchingCamera}
              label="Retake Last Frame"
              variant="secondary"
              onPress={handleRetakeLastFrame}
            />
          </View>
        ) : null}

        {activeMenu === "actions" ? (
          <View style={styles.menuPanel}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Actions</Text>
              <Text style={styles.menuMeta}>Rotation workflow</Text>
            </View>
            <Button
              disabled={frameCount === 0 || isLaunchingCamera}
              label="Complete Rotation"
              onPress={handleCompleteRotation}
            />
            <Button
              label="Back to Plan"
              variant="secondary"
              onPress={() => navigation.navigate("CapturePlan", { projectId })}
            />
          </View>
        ) : null}

        {captureError ? (
          <Text style={styles.errorMessage}>{captureError}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    backgroundColor: colors.background,
    flex: 1
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm
  },
  titleGroup: {
    flex: 1,
    gap: 2
  },
  eyebrow: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: "900"
  },
  frameBadge: {
    alignItems: "center",
    backgroundColor: colors.text,
    borderRadius: 8,
    minWidth: 70,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  frameBadgeValue: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900"
  },
  frameBadgeLabel: {
    color: "#dfece8",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  previewShell: {
    backgroundColor: "#101817",
    borderRadius: 8,
    height: 250,
    marginHorizontal: spacing.md,
    overflow: "hidden"
  },
  previewGrid: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  previewGuide: {
    borderColor: "rgba(255, 255, 255, 0.34)",
    borderRadius: 999,
    borderWidth: 2,
    height: "58%",
    width: "72%"
  },
  previewLineHorizontal: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    height: 1,
    position: "absolute",
    width: "78%"
  },
  previewLineVertical: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    height: "65%",
    position: "absolute",
    width: 1
  },
  previewCornerTopLeft: {
    borderColor: "rgba(255, 255, 255, 0.5)",
    borderLeftWidth: 2,
    borderTopWidth: 2,
    height: 34,
    left: spacing.md,
    position: "absolute",
    top: spacing.md,
    width: 34
  },
  previewCornerTopRight: {
    borderColor: "rgba(255, 255, 255, 0.5)",
    borderRightWidth: 2,
    borderTopWidth: 2,
    height: 34,
    position: "absolute",
    right: spacing.md,
    top: spacing.md,
    width: 34
  },
  previewCornerBottomLeft: {
    borderBottomWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
    borderLeftWidth: 2,
    bottom: spacing.md,
    height: 34,
    left: spacing.md,
    position: "absolute",
    width: 34
  },
  previewCornerBottomRight: {
    borderBottomWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
    borderRightWidth: 2,
    bottom: spacing.md,
    height: 34,
    position: "absolute",
    right: spacing.md,
    width: 34
  },
  previewStatusBar: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    padding: spacing.md,
    position: "absolute",
    right: 0
  },
  previewStatusLabel: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  previewStatusValue: {
    color: "#dfece8",
    fontSize: 13,
    fontWeight: "800"
  },
  toolbar: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: 4
  },
  toolbarItem: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    justifyContent: "center",
    minHeight: 42
  },
  toolbarItemActive: {
    backgroundColor: colors.text
  },
  toolbarText: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "900"
  },
  toolbarTextActive: {
    color: "#ffffff"
  },
  content: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xl
  },
  progressCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  progressHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  progressTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "900"
  },
  progressMeta: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "900"
  },
  progressTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    height: 8,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 8
  },
  menuPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2
  },
  menuHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  menuTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  menuMeta: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  lastFrameCard: {
    alignItems: "center",
    backgroundColor: "#f7fafb",
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
    height: 62,
    width: 62
  },
  lastFrameText: {
    flex: 1,
    gap: 2
  },
  lastFrameTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  lastFrameMeta: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700"
  },
  emptyFrameList: {
    alignItems: "center",
    backgroundColor: "#f7fafb",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 72
  },
  emptyFrameText: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: "800"
  },
  frameStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  frameTile: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    overflow: "hidden",
    width: 70
  },
  frameTileImage: {
    height: 64,
    width: 70
  },
  frameTileLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    padding: 6,
    textAlign: "center"
  },
  errorMessage: {
    backgroundColor: "#f0d8d5",
    borderRadius: 8,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    padding: spacing.md
  },
  pressed: {
    opacity: 0.78
  }
});
