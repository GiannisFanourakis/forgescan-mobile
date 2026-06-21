import { useIsFocused } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CameraCapturedPicture, CameraView, useCameraPermissions } from "expo-camera";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
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
import {
  RECOMMENDED_HIGH_QUALITY_FRAMES,
  RECOMMENDED_MINIMUM_FRAMES,
  getCoverageLabel,
  getCoverageWarning
} from "../core/coverage";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureRotation">;
type CameraMode = "photo" | "burst" | "video";
type ToolbarMenu = "camera" | "frames" | "actions";
type BurstIntervalMs = 500 | 1000 | 2000;

const toolbarMenus: { label: string; value: ToolbarMenu }[] = [
  { label: "Camera", value: "camera" },
  { label: "Frames", value: "frames" },
  { label: "Actions", value: "actions" }
];

const cameraModes: { label: string; value: CameraMode }[] = [
  { label: "Photo", value: "photo" },
  { label: "Burst", value: "burst" },
  { label: "Video", value: "video" }
];

const burstIntervalOptions: { label: string; value: BurstIntervalMs }[] = [
  { label: "0.5s", value: 500 },
  { label: "1s", value: 1000 },
  { label: "2s", value: 2000 }
];

export function CaptureRotationScreen({
  navigation,
  route
}: Props): ReactElement {
  const {
    addCapturedFrame,
    addCapturedVideo,
    addSimulatedFrame,
    completeRotation,
    deleteLastVideo,
    getProject,
    retakeLastFrame
  } = useProjects();
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);
  const captureInFlightRef = useRef(false);
  const burstStopRequestedRef = useRef(false);
  const burstDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstDelayResolveRef = useRef<(() => void) | null>(null);
  const videoStartedAtRef = useRef<number | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [activeMenu, setActiveMenu] = useState<ToolbarMenu>("camera");
  const [cameraMode, setCameraMode] = useState<CameraMode>("photo");
  const [burstIntervalMs, setBurstIntervalMs] =
    useState<BurstIntervalMs>(1000);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isBurstRunning, setIsBurstRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
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
  const videoCount = rotation.videos?.length ?? 0;
  const recommendedFrameCount = project.capture.targetFrameCount;
  const lastFrame = rotation.frames[frameCount - 1];
  const lastVideo = rotation.videos?.[videoCount - 1];
  const coverageWarning = getCoverageWarning(frameCount);
  const progressPercent =
    recommendedFrameCount > 0
      ? Math.min(100, (frameCount / recommendedFrameCount) * 100)
      : 0;
  const projectId = project.project.id;
  const rotationId = rotation.id;
  const nextFrameNumber = frameCount + 1;
  const canUseCamera = permission?.granted === true && isCameraReady;

  async function handlePrimaryCapture(): Promise<void> {
    if (cameraMode === "photo") {
      await captureSinglePhoto();
      return;
    }

    if (cameraMode === "burst") {
      await startBurstCapture();
      return;
    }

    if (isRecording) {
      cameraRef.current?.stopRecording();
      return;
    }

    await startVideoCapture();
  }

  async function captureSinglePhoto(): Promise<boolean> {
    if (
      !cameraRef.current ||
      !canUseCamera ||
      isCapturing ||
      captureInFlightRef.current ||
      isRecording
    ) {
      return false;
    }

    captureInFlightRef.current = true;
    setIsCapturing(true);
    setCaptureError(null);

    try {
      const photo: CameraCapturedPicture =
        await cameraRef.current.takePictureAsync({
          quality: 0.94,
          skipProcessing: false
        });

      await addCapturedFrame(projectId, rotationId, {
        uri: photo.uri,
        width: photo.width,
        height: photo.height
      });
      return true;
    } catch (error: unknown) {
      setCaptureError(
        error instanceof Error ? error.message : "Photo capture failed."
      );
      return false;
    } finally {
      captureInFlightRef.current = false;
      setIsCapturing(false);
    }
  }

  async function startBurstCapture(): Promise<void> {
    if (!canUseCamera || isBurstRunning || isRecording) {
      return;
    }

    burstStopRequestedRef.current = false;
    setCaptureError(null);
    setIsBurstRunning(true);

    try {
      let burstFrameNumber = 1;
      while (!burstStopRequestedRef.current) {
        if (burstStopRequestedRef.current) {
          break;
        }

        setCaptureStatus(`Burst frame ${burstFrameNumber}`);
        const didCapture = await captureSinglePhoto();

        if (!didCapture || burstStopRequestedRef.current) {
          break;
        }

        burstFrameNumber += 1;
        await waitForBurstInterval(burstIntervalMs);
      }
    } finally {
      clearBurstDelay();
      burstStopRequestedRef.current = false;
      setCaptureStatus(null);
      setIsBurstRunning(false);
    }
  }

  async function startVideoCapture(): Promise<void> {
    if (!cameraRef.current || !canUseCamera || isRecording || isBurstRunning) {
      return;
    }

    setCaptureError(null);
    setIsRecording(true);
    setCaptureStatus("Recording video");
    videoStartedAtRef.current = Date.now();

    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: 60
      });

      if (video?.uri) {
        const startedAt = videoStartedAtRef.current;
        await addCapturedVideo(projectId, rotationId, {
          uri: video.uri,
          ...(startedAt ? { durationMs: Date.now() - startedAt } : {})
        });
      }
    } catch (error: unknown) {
      setCaptureError(
        error instanceof Error ? error.message : "Video capture failed."
      );
    } finally {
      setIsRecording(false);
      setCaptureStatus(null);
      videoStartedAtRef.current = null;
    }
  }

  function stopBurstCapture(): void {
    burstStopRequestedRef.current = true;
    setCaptureStatus("Stopping burst");
    clearBurstDelay();
  }

  function waitForBurstInterval(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      burstDelayResolveRef.current = resolve;
      burstDelayRef.current = setTimeout(() => {
        burstDelayRef.current = null;
        burstDelayResolveRef.current = null;
        resolve();
      }, durationMs);
    });
  }

  function clearBurstDelay(): void {
    if (burstDelayRef.current) {
      clearTimeout(burstDelayRef.current);
    }

    const resolveDelay = burstDelayResolveRef.current;
    burstDelayRef.current = null;
    burstDelayResolveRef.current = null;
    resolveDelay?.();
  }

  function handleCompleteRotation(): void {
    completeRotation(projectId, rotationId);
    navigation.navigate("CapturePlan", { projectId });
  }

  function getPrimaryButtonLabel(): string {
    if (cameraMode === "photo") {
      return isCapturing ? "Capturing" : "Take Photo";
    }

    if (cameraMode === "burst") {
      return isBurstRunning ? "Stop Burst" : "Start Timed Burst";
    }

    return isRecording ? "Stop Recording" : "Record Video";
  }

  const primaryActionDisabled =
    !canUseCamera ||
    (isCapturing && !(cameraMode === "burst" && isBurstRunning)) ||
    (cameraMode !== "burst" && isBurstRunning);

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
        {permission?.granted && isFocused ? (
          <CameraView
            ref={cameraRef}
            active={isFocused}
            animateShutter
            facing="back"
            mode={cameraMode === "video" ? "video" : "picture"}
            mute
            onCameraReady={() => setIsCameraReady(true)}
            onMountError={(event) => setCaptureError(event.message)}
            style={styles.cameraView}
          />
        ) : null}
        <View pointerEvents="none" style={styles.previewOverlay}>
          {!permission?.granted ? (
            <View style={styles.emptyPreviewState}>
              <Text style={styles.emptyPreviewTitle}>Camera ready</Text>
              <Text style={styles.emptyPreviewText}>
                Grant access to open the ForgeScan camera.
              </Text>
            </View>
          ) : !isCameraReady ? (
            <View style={styles.emptyPreviewState}>
              <Text style={styles.emptyPreviewTitle}>Standby</Text>
              <Text style={styles.emptyPreviewText}>Preparing preview</Text>
            </View>
          ) : null}
          <View style={styles.previewGuide} />
          <View style={styles.previewLineHorizontal} />
          <View style={styles.previewLineVertical} />
          <View style={styles.previewStatusBar}>
            <Text style={styles.previewStatusLabel}>
              {captureStatus ?? `Frame ${nextFrameNumber}`}
            </Text>
            <Text style={styles.previewStatusValue}>
              {frameCount} captured
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.modeStrip}>
        {cameraModes.map((mode) => (
          <Pressable
            accessibilityRole="button"
            disabled={isRecording || isBurstRunning}
            key={mode.value}
            onPress={() => setCameraMode(mode.value)}
            style={({ pressed }) => [
              styles.modeItem,
              cameraMode === mode.value ? styles.modeItemActive : undefined,
              pressed && !isRecording && !isBurstRunning ? styles.pressed : undefined
            ]}
          >
            <Text
              style={[
                styles.modeText,
                cameraMode === mode.value ? styles.modeTextActive : undefined
              ]}
            >
              {mode.label}
            </Text>
          </Pressable>
        ))}
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
            <Text style={styles.progressMeta}>
              {getCoverageLabel(frameCount)}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.guidanceText}>
            {frameCount} frames captured. Recommended minimum{" "}
            {RECOMMENDED_MINIMUM_FRAMES}; high quality{" "}
            {RECOMMENDED_HIGH_QUALITY_FRAMES}+; preset guidance{" "}
            {recommendedFrameCount}. You can keep capturing until you manually
            complete the rotation.
          </Text>
          {frameCount >= 180 ? (
            <Text style={styles.warningText}>
              Large project warning: very high frame counts create larger local
              files and slower exports.
            </Text>
          ) : coverageWarning ? (
            <Text style={styles.warningText}>{coverageWarning}</Text>
          ) : null}
        </View>

        {activeMenu === "camera" ? (
          <View style={styles.menuPanel}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Camera</Text>
              <Text style={styles.menuMeta}>{cameraMode}</Text>
            </View>
            {!permission?.granted ? (
              <Button label="Grant Camera Access" onPress={requestPermission} />
            ) : (
              <Button
                disabled={primaryActionDisabled}
                label={getPrimaryButtonLabel()}
                variant={isRecording || isBurstRunning ? "danger" : "primary"}
                onPress={
                  isBurstRunning ? stopBurstCapture : handlePrimaryCapture
                }
              />
            )}
            {cameraMode === "burst" ? (
              <View style={styles.optionRow}>
                {burstIntervalOptions.map((option) => (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isBurstRunning}
                    key={option.value}
                    onPress={() => setBurstIntervalMs(option.value)}
                    style={({ pressed }) => [
                      styles.optionChip,
                      burstIntervalMs === option.value
                        ? styles.optionChipActive
                        : undefined,
                      pressed && !isBurstRunning ? styles.pressed : undefined
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        burstIntervalMs === option.value
                          ? styles.optionChipTextActive
                          : undefined
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Button
              disabled={isRecording || isBurstRunning || isCapturing}
              label="Simulate Frame"
              variant="secondary"
              onPress={() => addSimulatedFrame(projectId, rotationId)}
            />
          </View>
        ) : null}

        {activeMenu === "frames" ? (
          <View style={styles.menuPanel}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Frames</Text>
              <Text style={styles.menuMeta}>
                {frameCount} photos / {videoCount} videos
              </Text>
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
            {lastVideo ? (
              <View style={styles.videoRow}>
                <View>
                  <Text style={styles.videoTitle}>{lastVideo.filename}</Text>
                  <Text style={styles.videoMeta}>
                    {lastVideo.durationMs
                      ? `${Math.round(lastVideo.durationMs / 1000)} sec`
                      : "Video clip"}
                  </Text>
                </View>
                <Text style={styles.videoBadge}>MP4</Text>
              </View>
            ) : null}
            <View style={styles.twoButtonRow}>
              <Button
                disabled={frameCount === 0 || isCapturing || isRecording}
                label="Delete Last Photo"
                variant="danger"
                onPress={() => retakeLastFrame(projectId, rotationId)}
              />
              <Button
                disabled={videoCount === 0 || isRecording}
                label="Delete Last Video"
                variant="danger"
                onPress={() => deleteLastVideo(projectId, rotationId)}
              />
            </View>
          </View>
        ) : null}

        {activeMenu === "actions" ? (
          <View style={styles.menuPanel}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Actions</Text>
              <Text style={styles.menuMeta}>Rotation workflow</Text>
            </View>
            <Button
              disabled={frameCount === 0 || isRecording || isBurstRunning}
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
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md
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
    height: 270,
    marginHorizontal: spacing.md,
    overflow: "hidden"
  },
  cameraView: {
    flex: 1
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  emptyPreviewState: {
    alignItems: "center",
    backgroundColor: "rgba(16, 24, 23, 0.86)",
    borderRadius: 8,
    gap: spacing.xs,
    padding: spacing.md,
    position: "absolute",
    zIndex: 2
  },
  emptyPreviewTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900"
  },
  emptyPreviewText: {
    color: "#dfece8",
    fontSize: 13,
    fontWeight: "700"
  },
  previewGuide: {
    borderColor: "rgba(255, 255, 255, 0.38)",
    borderRadius: 999,
    borderWidth: 2,
    height: "58%",
    width: "72%"
  },
  previewLineHorizontal: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    height: 1,
    position: "absolute",
    width: "78%"
  },
  previewLineVertical: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    height: "65%",
    position: "absolute",
    width: 1
  },
  previewStatusBar: {
    alignItems: "center",
    backgroundColor: "rgba(16, 24, 23, 0.76)",
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
  modeStrip: {
    flexDirection: "row",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md
  },
  modeItem: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42
  },
  modeItemActive: {
    backgroundColor: colors.text,
    borderColor: colors.text
  },
  modeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  modeTextActive: {
    color: "#ffffff"
  },
  toolbar: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: 4
  },
  toolbarItem: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    justifyContent: "center",
    minHeight: 40
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
  guidanceText: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18
  },
  warningText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
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
  optionRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  optionChip: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 40
  },
  optionChipActive: {
    backgroundColor: "#ecf6f6",
    borderColor: colors.accent
  },
  optionChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  optionChipTextActive: {
    color: colors.accent
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
  videoRow: {
    alignItems: "center",
    backgroundColor: "#f7fafb",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md
  },
  videoTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  videoMeta: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: "700"
  },
  videoBadge: {
    color: colors.sky,
    fontSize: 12,
    fontWeight: "900"
  },
  twoButtonRow: {
    gap: spacing.sm
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
