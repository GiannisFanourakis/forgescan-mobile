import { useIsFocused } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { CameraCapturedPicture, VideoQuality } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Screen } from "../components/Screen";
import {
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

const videoQualityOptions: { label: string; value: VideoQuality }[] = [
  { label: "4K", value: "2160p" },
  { label: "1080", value: "1080p" },
  { label: "720", value: "720p" }
];

const ZOOM_STEP = 0.08;

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
  const [activeMenu, setActiveMenu] = useState<ToolbarMenu | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("photo");
  const [cameraZoom, setCameraZoom] = useState(0);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("2160p");
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
        <Text style={styles.missingTitle}>Rotation not found</Text>
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

  function setZoomLevel(value: number): void {
    setCameraZoom(Math.max(0, Math.min(1, value)));
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

  function getVideoBitrate(quality: VideoQuality): number {
    switch (quality) {
      case "2160p":
        return 48_000_000;
      case "1080p":
        return 18_000_000;
      case "720p":
        return 8_000_000;
      default:
        return 10_000_000;
    }
  }

  const primaryActionDisabled =
    !canUseCamera ||
    (isCapturing && !(cameraMode === "burst" && isBurstRunning)) ||
    (cameraMode !== "burst" && isBurstRunning);
  const shutterDisabled = permission?.granted ? primaryActionDisabled : false;

  return (
    <View style={styles.cameraRoot}>
      <StatusBar style="light" translucent />
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
          videoBitrate={getVideoBitrate(videoQuality)}
          videoQuality={videoQuality}
          zoom={cameraZoom}
        />
      ) : (
        <View style={styles.cameraFallback} />
      )}

      <View pointerEvents="none" style={styles.previewOverlay}>
        {!permission?.granted ? (
          <View style={styles.emptyPreviewState}>
            <Text style={styles.emptyPreviewTitle}>Camera access</Text>
            <Text style={styles.emptyPreviewText}>
              Tap the shutter to grant access.
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
      </View>

      <SafeAreaView pointerEvents="box-none" style={styles.overlaySafe}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate("CapturePlan", { projectId })}
            style={({ pressed }) => [
              styles.backButton,
              pressed ? styles.pressed : undefined
            ]}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>{project.project.title}</Text>
            <Text style={styles.title}>{rotation.label}</Text>
          </View>
          <View style={styles.frameBadge}>
            <Text style={styles.frameBadgeValue}>{frameCount}</Text>
            <Text style={styles.frameBadgeLabel}>Frames</Text>
          </View>
        </View>

        {captureError ? (
          <Text style={styles.errorMessage}>{captureError}</Text>
        ) : null}

        <View style={styles.captureSpacer} />

        <View style={styles.bottomDock}>
          <View style={styles.captureReadout}>
            <View style={styles.readoutText}>
              <Text style={styles.previewStatusLabel}>
                {captureStatus ?? `Frame ${nextFrameNumber}`}
              </Text>
              <Text style={styles.previewStatusValue}>{rotation.angleHint}</Text>
            </View>
            <View style={styles.coverageBadge}>
              <Text style={styles.coverageValue}>{getCoverageLabel(frameCount)}</Text>
              <Text style={styles.coverageLabel}>{frameCount} captured</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>

          {frameCount >= 180 ? (
            <Text style={styles.warningText}>
              Large project: very high frame counts make larger local files.
            </Text>
          ) : coverageWarning ? (
            <Text style={styles.warningText}>{coverageWarning}</Text>
          ) : null}

          <View style={styles.zoomRow}>
            <Pressable
              accessibilityRole="button"
              disabled={!permission?.granted || cameraZoom <= 0}
              onPress={() => setZoomLevel(cameraZoom - ZOOM_STEP)}
              style={({ pressed }) => [
                styles.zoomButton,
                cameraZoom <= 0 ? styles.sideControlDisabled : undefined,
                pressed && permission?.granted ? styles.pressed : undefined
              ]}
            >
              <Text style={styles.zoomButtonText}>-</Text>
            </Pressable>
            <View style={styles.zoomInfo}>
              <Text style={styles.zoomValue}>
                Zoom {Math.round(cameraZoom * 100)}%
              </Text>
              <View style={styles.zoomTrack}>
                <View
                  style={[
                    styles.zoomFill,
                    { width: `${Math.round(cameraZoom * 100)}%` }
                  ]}
                />
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={!permission?.granted || cameraZoom >= 1}
              onPress={() => setZoomLevel(cameraZoom + ZOOM_STEP)}
              style={({ pressed }) => [
                styles.zoomButton,
                cameraZoom >= 1 ? styles.sideControlDisabled : undefined,
                pressed && permission?.granted ? styles.pressed : undefined
              ]}
            >
              <Text style={styles.zoomButtonText}>+</Text>
            </Pressable>
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
                  pressed && !isRecording && !isBurstRunning
                    ? styles.pressed
                    : undefined
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

          <View style={styles.shutterRow}>
            <Pressable
              accessibilityRole="button"
              disabled={isRecording || isBurstRunning}
              onPress={() =>
                setActiveMenu(activeMenu === "frames" ? null : "frames")
              }
              style={({ pressed }) => [
                styles.sideControl,
                activeMenu === "frames" ? styles.sideControlActive : undefined,
                pressed && !isRecording && !isBurstRunning
                  ? styles.pressed
                  : undefined
              ]}
            >
              <Text style={styles.sideControlText}>Frames</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={shutterDisabled}
              onPress={() => {
                if (!permission?.granted) {
                  void requestPermission();
                  return;
                }

                if (isBurstRunning) {
                  stopBurstCapture();
                  return;
                }

                void handlePrimaryCapture();
              }}
              style={({ pressed }) => [
                styles.shutterButton,
                isRecording || isBurstRunning ? styles.shutterButtonStop : undefined,
                shutterDisabled ? styles.shutterButtonDisabled : undefined,
                pressed && !shutterDisabled ? styles.pressed : undefined
              ]}
            >
              <View
                style={[
                  styles.shutterButtonInner,
                  isRecording || isBurstRunning
                    ? styles.shutterButtonInnerStop
                    : undefined
                ]}
              />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={frameCount === 0 || isRecording || isBurstRunning}
              onPress={handleCompleteRotation}
              style={({ pressed }) => [
                styles.sideControl,
                styles.doneControl,
                pressed && frameCount > 0 && !isRecording && !isBurstRunning
                  ? styles.pressed
                  : undefined,
                frameCount === 0 || isRecording || isBurstRunning
                  ? styles.sideControlDisabled
                  : undefined
              ]}
            >
              <Text style={styles.sideControlText}>Done</Text>
            </Pressable>
          </View>

          <Text style={styles.shutterLabel}>
            {permission?.granted ? getPrimaryButtonLabel() : "Grant Camera Access"}
          </Text>

          <View style={styles.toolbar}>
            {toolbarMenus.map((menu) => (
              <Pressable
                accessibilityRole="button"
                key={menu.value}
                onPress={() =>
                  setActiveMenu(activeMenu === menu.value ? null : menu.value)
                }
                style={({ pressed }) => [
                  styles.toolbarItem,
                  activeMenu === menu.value ? styles.toolbarItemActive : undefined,
                  pressed ? styles.pressed : undefined
                ]}
              >
                <Text
                  style={[
                    styles.toolbarText,
                    activeMenu === menu.value
                      ? styles.toolbarTextActive
                      : undefined
                  ]}
                >
                  {menu.label}
                </Text>
              </Pressable>
            ))}
          </View>

        {activeMenu === "camera" ? (
          <View style={styles.menuPanel}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Camera</Text>
              <Text style={styles.menuMeta}>{cameraMode}</Text>
            </View>
            {cameraMode === "burst" ? (
              <View style={styles.optionGroup}>
                <Text style={styles.optionGroupTitle}>Burst</Text>
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
              </View>
            ) : null}
            {cameraMode === "video" ? (
              <View style={styles.optionGroup}>
                <Text style={styles.optionGroupTitle}>Video</Text>
                <View style={styles.optionRow}>
                  {videoQualityOptions.map((option) => (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isRecording}
                      key={option.value}
                      onPress={() => setVideoQuality(option.value)}
                      style={({ pressed }) => [
                        styles.optionChip,
                        videoQuality === option.value
                          ? styles.optionChipActive
                          : undefined,
                        pressed && !isRecording ? styles.pressed : undefined
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          videoQuality === option.value
                            ? styles.optionChipTextActive
                            : undefined
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {!permission?.granted ? (
              <CompactMenuButton
                label="Grant Camera"
                onPress={requestPermission}
              />
            ) : null}
            <CompactMenuButton
              disabled={isRecording || isBurstRunning || isCapturing}
              label="Sim Frame"
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
                {rotation.frames.slice(-4).map((frame) => (
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
              <CompactMenuButton
                disabled={frameCount === 0 || isCapturing || isRecording}
                label="Delete Photo"
                tone="danger"
                onPress={() => retakeLastFrame(projectId, rotationId)}
              />
              <CompactMenuButton
                disabled={videoCount === 0 || isRecording}
                label="Delete Video"
                tone="danger"
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
            <CompactMenuButton
              disabled={frameCount === 0 || isRecording || isBurstRunning}
              label="Complete Rotation"
              tone="primary"
              onPress={handleCompleteRotation}
            />
            <CompactMenuButton
              label="Back to Plan"
              onPress={() => navigation.navigate("CapturePlan", { projectId })}
            />
          </View>
        ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

interface CompactMenuButtonProps {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  tone?: "default" | "primary" | "danger";
}

function CompactMenuButton({
  disabled = false,
  label,
  onPress,
  tone = "default"
}: CompactMenuButtonProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactButton,
        tone === "primary" ? styles.compactButtonPrimary : undefined,
        tone === "danger" ? styles.compactButtonDanger : undefined,
        disabled ? styles.compactButtonDisabled : undefined,
        pressed && !disabled ? styles.pressed : undefined
      ]}
    >
      <Text
        style={[
          styles.compactButtonText,
          tone === "primary" ? styles.compactButtonTextPrimary : undefined,
          tone === "danger" ? styles.compactButtonTextDanger : undefined,
          disabled ? styles.compactButtonTextDisabled : undefined
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  missingTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900"
  },
  cameraRoot: {
    backgroundColor: "#050706",
    flex: 1
  },
  cameraView: {
    ...StyleSheet.absoluteFillObject
  },
  cameraFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#101817"
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  emptyPreviewState: {
    alignItems: "center",
    backgroundColor: "rgba(16, 24, 23, 0.88)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 8,
    borderWidth: 1,
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
    borderColor: "rgba(255, 255, 255, 0.42)",
    borderRadius: 999,
    borderWidth: 2,
    height: "42%",
    width: "78%"
  },
  previewLineHorizontal: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    height: 1,
    position: "absolute",
    width: "84%"
  },
  previewLineVertical: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    height: "50%",
    position: "absolute",
    width: 1
  },
  overlaySafe: {
    flex: 1,
    paddingHorizontal: spacing.md
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    paddingTop: spacing.sm
  },
  backButton: {
    alignItems: "center",
    backgroundColor: "rgba(5, 7, 6, 0.66)",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.sm
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  titleGroup: {
    flex: 1,
    gap: 2
  },
  eyebrow: {
    color: "rgba(255, 255, 255, 0.78)",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  title: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  },
  frameBadge: {
    alignItems: "center",
    backgroundColor: "rgba(5, 7, 6, 0.66)",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
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
  captureSpacer: {
    flex: 1
  },
  bottomDock: {
    backgroundColor: "rgba(5, 7, 6, 0.76)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 7,
    marginBottom: spacing.xs,
    padding: spacing.xs
  },
  captureReadout: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  readoutText: {
    flex: 1,
    gap: 2
  },
  previewStatusLabel: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  previewStatusValue: {
    color: "#dfece8",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  coverageBadge: {
    alignItems: "flex-end",
    gap: 2
  },
  coverageValue: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  coverageLabel: {
    color: "#dfece8",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  progressTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    height: 5,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    height: 5
  },
  warningText: {
    color: "#ffd28a",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  zoomRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs
  },
  zoomButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 38
  },
  zoomButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 20
  },
  zoomInfo: {
    flex: 1,
    gap: 3
  },
  zoomValue: {
    color: "#dfece8",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase"
  },
  zoomTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    height: 4,
    overflow: "hidden"
  },
  zoomFill: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    height: 4
  },
  modeStrip: {
    flexDirection: "row",
    gap: spacing.xs
  },
  modeItem: {
    alignItems: "center",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 30
  },
  modeItemActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff"
  },
  modeText: {
    color: "#dfece8",
    fontSize: 11,
    fontWeight: "900"
  },
  modeTextActive: {
    color: "#101817"
  },
  shutterRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sideControl: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 70,
    paddingHorizontal: spacing.xs
  },
  sideControlActive: {
    backgroundColor: "rgba(255, 255, 255, 0.22)"
  },
  doneControl: {
    backgroundColor: "rgba(17, 100, 102, 0.78)"
  },
  sideControlDisabled: {
    opacity: 0.42
  },
  sideControlText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900"
  },
  shutterButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderColor: "#ffffff",
    borderRadius: 999,
    borderWidth: 3,
    height: 68,
    justifyContent: "center",
    width: 68
  },
  shutterButtonStop: {
    borderColor: "#ffddd9"
  },
  shutterButtonDisabled: {
    opacity: 0.42
  },
  shutterButtonInner: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    height: 48,
    width: 48
  },
  shutterButtonInnerStop: {
    backgroundColor: "#d14c40",
    borderRadius: 8,
    height: 30,
    width: 30
  },
  shutterLabel: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center"
  },
  toolbar: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    padding: 3
  },
  toolbarItem: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    justifyContent: "center",
    minHeight: 30
  },
  toolbarItemActive: {
    backgroundColor: "#ffffff"
  },
  toolbarText: {
    color: "#dfece8",
    fontSize: 11,
    fontWeight: "900"
  },
  toolbarTextActive: {
    color: "#101817"
  },
  menuPanel: {
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.xs
  },
  menuHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  menuTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900"
  },
  menuMeta: {
    color: colors.mutedText,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  optionGroup: {
    gap: spacing.xs
  },
  optionGroupTitle: {
    color: colors.mutedText,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  optionRow: {
    flexDirection: "row",
    gap: spacing.xs
  },
  optionChip: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 30
  },
  optionChipActive: {
    backgroundColor: "#ecf6f6",
    borderColor: colors.accent
  },
  optionChipText: {
    color: colors.text,
    fontSize: 11,
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
    minHeight: 42
  },
  emptyFrameText: {
    color: colors.mutedText,
    fontSize: 12,
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
    width: 48
  },
  frameTileImage: {
    height: 42,
    width: 48
  },
  frameTileLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "900",
    padding: 3,
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
    padding: spacing.xs
  },
  videoTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900"
  },
  videoMeta: {
    color: colors.mutedText,
    fontSize: 10,
    fontWeight: "700"
  },
  videoBadge: {
    color: colors.sky,
    fontSize: 10,
    fontWeight: "900"
  },
  twoButtonRow: {
    flexDirection: "row",
    gap: spacing.xs
  },
  compactButton: {
    alignItems: "center",
    backgroundColor: "#f7fafb",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: spacing.xs
  },
  compactButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  compactButtonDanger: {
    backgroundColor: "#f0d8d5",
    borderColor: "#e4b9b4"
  },
  compactButtonDisabled: {
    opacity: 0.42
  },
  compactButtonText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900"
  },
  compactButtonTextPrimary: {
    color: "#ffffff"
  },
  compactButtonTextDanger: {
    color: colors.danger
  },
  compactButtonTextDisabled: {
    color: colors.mutedText
  },
  errorMessage: {
    backgroundColor: "rgba(240, 216, 213, 0.94)",
    borderRadius: 8,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
    padding: spacing.md
  },
  pressed: {
    opacity: 0.78
  }
});
