import { useIsFocused } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import type { GestureResponderEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Screen } from "../components/Screen";
import {
  getFramePoseReadiness,
  getPoseCompletenessForRotation
} from "../capture/trackedCaptureReadiness";
import { PoseSynchronization } from "../core/manifest";
import { RootStackParamList } from "../navigation/types";
import {
  captureNativeCameraXPhoto,
  getNativeAdvancedCameraAvailability,
  isNativeCameraXCaptureAvailable,
  startNativeCameraXVideo,
  stopNativeCameraXVideo
} from "../native/NativeAdvancedCamera";
import type {
  NativeAdvancedCameraAvailability,
  NativeCameraXVideoQuality
} from "../native/NativeAdvancedCameraTypes";
import {
  endNativeARCaptureSession,
  getNativeARCaptureAvailability
} from "../native/NativeARCapture";
import type {
  NativeARCaptureResult,
  NativeARCaptureStatus
} from "../native/NativeARCaptureTypes";
import { NativeCameraXView } from "../native/NativeCameraXView";
import { useProjects } from "../state/ProjectContext";
import { getProjectStoragePaths } from "../storage/projectStorage";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureRotation">;
type CameraMode = "video";
type ToolbarMenu = "camera" | "clips" | "actions";
type BurstIntervalMs = 500 | 1000 | 2000;
type CaptureTimerSeconds = 0 | 3 | 10;
type RealCapturePath = "arcore-tracked" | "basic-untracked";

const toolbarMenus: { label: string; value: ToolbarMenu }[] = [
  { label: "Settings", value: "camera" },
  { label: "Clips", value: "clips" },
  { label: "Done", value: "actions" }
];

const cameraModes: { label: string; value: CameraMode }[] = [
  { label: "Video", value: "video" }
];

const arCoreTrackedCaptureDisabledReason =
  "Clip capture is ready.";

const realCapturePaths: { label: string; value: RealCapturePath }[] = [
  { label: "Basic", value: "basic-untracked" }
];

const burstIntervalOptions: { label: string; value: BurstIntervalMs }[] = [
  { label: "0.5s", value: 500 },
  { label: "1s", value: 1000 },
  { label: "2s", value: 2000 }
];

const captureTimerOptions: { label: string; value: CaptureTimerSeconds }[] = [
  { label: "Off", value: 0 },
  { label: "3s", value: 3 },
  { label: "10s", value: 10 }
];

const quickZoomOptions: { label: string; value: number }[] = [
  { label: "0.5x", value: 0 },
  { label: "1x", value: 0.22 },
  { label: "2x", value: 0.55 },
  { label: "4x", value: 0.88 }
];

const videoQualityOptions: { label: string; value: NativeCameraXVideoQuality }[] = [
  { label: "4K", value: "2160p" },
  { label: "1080", value: "1080p" },
  { label: "720", value: "720p" }
];

const ZOOM_STEP = 0.08;
const DEFAULT_ISO_RANGE: [number, number] = [50, 12_800];
const DEFAULT_SHUTTER_RANGE_NS: [number, number] = [
  1_000_000,
  1_000_000_000
];
const shutterSpeedOptionsNs = [
  1_000_000_000 / 30,
  1_000_000_000 / 60,
  1_000_000_000 / 120,
  1_000_000_000 / 250,
  1_000_000_000 / 500
] as const;

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
  const captureInFlightRef = useRef(false);
  const burstStopRequestedRef = useRef(false);
  const burstDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstDelayResolveRef = useRef<(() => void) | null>(null);
  const videoStartedAtRef = useRef<number | null>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(0);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [activeMenu, setActiveMenu] = useState<ToolbarMenu | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("video");
  const [cameraZoom, setCameraZoom] = useState(0);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [captureTimerSeconds, setCaptureTimerSeconds] =
    useState<CaptureTimerSeconds>(0);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [videoQuality, setVideoQuality] =
    useState<NativeCameraXVideoQuality>("2160p");
  const [advancedCameraAvailability, setAdvancedCameraAvailability] =
    useState<NativeAdvancedCameraAvailability | null>(null);
  const [manualControlsEnabled, setManualControlsEnabled] = useState(false);
  const [manualIso, setManualIso] = useState(200);
  const [manualShutterNs, setManualShutterNs] = useState(1_000_000_000 / 60);
  const [manualFocusDistance, setManualFocusDistance] = useState(0);
  const [burstIntervalMs, setBurstIntervalMs] =
    useState<BurstIntervalMs>(1000);
  const [capturePath, setCapturePath] =
    useState<RealCapturePath>("basic-untracked");
  const [arCaptureStatus, setArCaptureStatus] =
    useState<NativeARCaptureStatus>("not-started");
  const [poseStatus, setPoseStatus] = useState("Pose not started");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isBurstRunning, setIsBurstRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const project = getProject(route.params.projectId);
  const rotation = project?.capture.rotations.find(
    (candidate) => candidate.id === route.params.rotationId
  );

  useEffect(() => {
    if (Platform.OS !== "android") {
      setHasCameraPermission(false);
      return;
    }

    void PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA).then(
      setHasCameraPermission
    );
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    void getNativeAdvancedCameraAvailability().then(
      setAdvancedCameraAvailability
    );
    void getNativeARCaptureAvailability().then((availability) => {
      setPoseStatus(
        availability.arCoreAvailable ? "Ready" : "Ready"
      );
    });
  }, []);

  useEffect(
    () => () => {
      if (Platform.OS === "android") {
        void endNativeARCaptureSession();
      }
    },
    []
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
  const lastFrame = rotation.frames[frameCount - 1];
  const lastVideo = rotation.videos?.[videoCount - 1];
  const lastFramePose = lastFrame ? getFramePoseReadiness(lastFrame) : null;
  const rotationPoseCompleteness = getPoseCompletenessForRotation(
    project,
    rotation.id
  );
  const poseMatrixStatus =
    !lastFrame || !lastFramePose
      ? "missing"
      : lastFramePose.hasValidPoseMatrix
        ? "valid"
        : lastFramePose.hasExtrinsics
          ? "invalid"
          : "missing";
  const lastCaptureSource = lastFrame?.captureSource ?? "unknown";
  const lastPoseSynchronization =
    lastFramePose?.poseSynchronization ?? "missing";
  const lastTrackingState = lastFramePose?.trackingState ?? "unknown";
  const coverageWarning =
    videoCount === 0 ? "Record one steady full-turn video for this rotation." : null;
  const progressPercent = videoCount > 0 ? 100 : 0;
  const projectId = project.project.id;
  const projectTitle = project.project.title;
  const rotationId = rotation.id;
  const nextFrameNumber = frameCount + 1;
  const nativeCameraAvailable =
    Platform.OS === "android" &&
    NativeCameraXView !== null &&
    isNativeCameraXCaptureAvailable();
  const canUseCamera =
    hasCameraPermission && nativeCameraAvailable && isFocused;
  const bestBackCamera = advancedCameraAvailability?.cameras.find(
    (camera) => camera.lensFacing === "back" && camera.manualSensor
  );
  const manualSupported =
    advancedCameraAvailability?.manualSensorSupported ?? false;
  const isoRange = bestBackCamera?.isoRange ?? DEFAULT_ISO_RANGE;
  const shutterRangeNs =
    bestBackCamera?.exposureTimeRangeNs ?? DEFAULT_SHUTTER_RANGE_NS;
  const maxFocusDistance = bestBackCamera?.minimumFocusDistance ?? 0;
  const projectDirectoryUri = getProjectStoragePaths(project).projectUri;
  const captureModeCopy = "Record one smooth full-turn clip.";

  async function requestCameraPermission(): Promise<void> {
    if (Platform.OS !== "android") {
      setCaptureError("Native camera capture currently targets Android dev builds.");
      return;
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA
    );
    setHasCameraPermission(result === PermissionsAndroid.RESULTS.GRANTED);
  }

  async function handlePrimaryCapture(): Promise<void> {
    if (isRecording) {
      await stopNativeCameraXVideo();
      return;
    }

    await startVideoCapture();
  }

  async function runCaptureTimer(): Promise<boolean> {
    if (captureTimerSeconds === 0) {
      return true;
    }

    if (!canUseCamera || isCapturing || isRecording || isBurstRunning) {
      return false;
    }

    for (let seconds = captureTimerSeconds; seconds > 0; seconds -= 1) {
      setCountdownSeconds(seconds);
      await sleep(1000);
    }

    setCountdownSeconds(null);
    return true;
  }

  async function captureSinglePhoto(): Promise<boolean> {
    if (
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
      const trackingReady =
        capturePath === "arcore-tracked" ? await ensureTrackedCaptureSession() : false;
      const photo = await captureNativeCameraXPhoto({
        projectId,
        rotationId,
        filename: `capture_${Date.now()}.jpg`,
        videoQuality
      });

      const trackedKeyframe =
        capturePath === "arcore-tracked" && trackingReady
          ? await captureTrackedKeyframe(photo)
          : null;
      const keyframe = trackedKeyframe?.keyframe;
      const tracked =
        trackedKeyframe?.status === "tracked" &&
        keyframe?.captureSource === "arcore-shared-camera" &&
        keyframe.cameraIntrinsics !== undefined &&
        keyframe.cameraExtrinsics !== undefined;
      const poseSynchronization: PoseSynchronization = tracked
        ? (keyframe?.poseSynchronization ?? "camera-photo-associated")
        : capturePath === "basic-untracked"
          ? "turntable-assumed"
          : "missing";

      await addCapturedFrame(projectId, rotationId, {
        uri: photo.uri,
        ...(photo.width && photo.width > 0 ? { width: photo.width } : {}),
        ...(photo.height && photo.height > 0 ? { height: photo.height } : {}),
        captureSource: tracked ? "arcore-shared-camera" : "camera",
        timestamp: keyframe?.timestamp ?? new Date().toISOString(),
        poseSynchronization,
        ...(keyframe?.cameraIntrinsics !== undefined
          ? { cameraIntrinsics: keyframe.cameraIntrinsics }
          : {}),
        ...(keyframe?.cameraExtrinsics !== undefined
          ? { cameraExtrinsics: keyframe.cameraExtrinsics }
          : {}),
        ...(keyframe?.trackingState !== undefined
          ? { trackingState: keyframe.trackingState }
          : {}),
        ...(keyframe?.exposureMetadata !== undefined
          ? { exposureMetadata: keyframe.exposureMetadata }
          : {}),
        ...(keyframe?.lensMetadata !== undefined
          ? { lensMetadata: keyframe.lensMetadata }
          : {}),
        ...(keyframe?.cameraTransformConvention !== undefined
          ? { cameraTransformConvention: keyframe.cameraTransformConvention }
          : {})
      });
      setPoseStatus(createCapturePoseStatus(poseSynchronization));
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
    if (!canUseCamera || isRecording || isBurstRunning) {
      return;
    }

    setCaptureError(null);
    if (capturePath === "arcore-tracked") {
      setCaptureError(
        "Video clip capture is the active scan mode."
      );
      return;
    }
    setIsRecording(true);
    setCaptureStatus("Recording video");
    videoStartedAtRef.current = Date.now();

    try {
      const video = await startNativeCameraXVideo({
        projectId,
        rotationId,
        filename: `capture_${Date.now()}.mp4`,
        videoQuality
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

  async function ensureTrackedCaptureSession(): Promise<boolean> {
    if (Platform.OS !== "android") {
      setPoseStatus("Android dev build required");
      return false;
    }

    setCapturePath("basic-untracked");
    setArCaptureStatus("failed");
    setPoseStatus("Ready");
    setCaptureError("Clip capture is ready.");
    return false;
  }

  async function captureTrackedKeyframe(photo: {
    uri: string;
    width?: number;
    height?: number;
  }): Promise<NativeARCaptureResult | null> {
    void photo;
    setCapturePath("basic-untracked");
    setPoseStatus("Ready");
    setCaptureError("Clip capture is ready.");
    return null;
  }

  function setManualIsoLevel(value: number): void {
    setManualIso(Math.round(Math.max(isoRange[0], Math.min(isoRange[1], value))));
  }

  function stepManualShutter(direction: -1 | 1): void {
    const currentIndex = shutterSpeedOptionsNs.reduce(
      (nearestIndex, option, index) =>
        Math.abs(option - manualShutterNs) <
        Math.abs((shutterSpeedOptionsNs[nearestIndex] ?? option) - manualShutterNs)
          ? index
          : nearestIndex,
      0
    );
    const nextIndex = Math.max(
      0,
      Math.min(shutterSpeedOptionsNs.length - 1, currentIndex + direction)
    );
    const nextShutter = shutterSpeedOptionsNs[nextIndex] ?? manualShutterNs;
    setManualShutterNs(
      Math.max(shutterRangeNs[0], Math.min(shutterRangeNs[1], nextShutter))
    );
  }

  function setManualFocusLevel(value: number): void {
    setManualFocusDistance(
      Math.max(0, Math.min(maxFocusDistance || 0, Number(value.toFixed(1))))
    );
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

  function sleep(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, durationMs);
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

  function shouldStartPinchResponder(event: GestureResponderEvent): boolean {
    return event.nativeEvent.touches.length >= 2;
  }

  function handlePinchGrant(event: GestureResponderEvent): void {
    pinchStartDistanceRef.current = getTouchDistance(event);
    pinchStartZoomRef.current = cameraZoom;
  }

  function handlePinchMove(event: GestureResponderEvent): void {
    const startDistance = pinchStartDistanceRef.current;
    const currentDistance = getTouchDistance(event);
    if (!startDistance || !currentDistance) {
      return;
    }

    const delta = (currentDistance - startDistance) / 280;
    setZoomLevel(pinchStartZoomRef.current + delta);
  }

  function handlePinchRelease(): void {
    pinchStartDistanceRef.current = null;
  }

  function handleCompleteRotation(): void {
    completeRotation(projectId, rotationId);
    navigation.navigate("CapturePlan", { projectId });
  }

  function cycleCaptureTimer(): void {
    const currentIndex = captureTimerOptions.findIndex(
      (option) => option.value === captureTimerSeconds
    );
    const nextIndex =
      currentIndex < 0 || currentIndex === captureTimerOptions.length - 1
        ? 0
        : currentIndex + 1;
    setCaptureTimerSeconds(captureTimerOptions[nextIndex]?.value ?? 0);
  }

  function getPrimaryButtonLabel(): string {
    return isRecording ? "Stop Recording" : "Record Video";
  }

  const primaryActionDisabled =
    !canUseCamera ||
    countdownSeconds !== null ||
    isCapturing ||
    isBurstRunning;
  const shutterDisabled = hasCameraPermission ? primaryActionDisabled : false;

  return (
    <View
      onMoveShouldSetResponderCapture={shouldStartPinchResponder}
      onResponderGrant={handlePinchGrant}
      onResponderMove={handlePinchMove}
      onResponderRelease={handlePinchRelease}
      onResponderTerminate={handlePinchRelease}
      onStartShouldSetResponderCapture={shouldStartPinchResponder}
      style={styles.cameraRoot}
    >
      <StatusBar style="light" translucent />
      {hasCameraPermission && isFocused && NativeCameraXView ? (
        <NativeCameraXView
          collapsable={false}
          manualControlsEnabled={manualControlsEnabled}
          manualFocusDistance={manualFocusDistance}
          manualIso={manualIso}
          manualShutterNs={manualShutterNs}
          style={styles.cameraView}
          torchEnabled={torchEnabled}
          videoQuality={videoQuality}
          zoom={cameraZoom}
        />
      ) : (
        <View style={styles.cameraFallback} />
      )}

      <View pointerEvents="none" style={styles.previewOverlay}>
        {!hasCameraPermission ? (
          <View style={styles.emptyPreviewState}>
            <Text style={styles.emptyPreviewTitle}>Camera access</Text>
            <Text style={styles.emptyPreviewText}>
              Tap the shutter to grant access.
            </Text>
          </View>
        ) : !nativeCameraAvailable ? (
          <View style={styles.emptyPreviewState}>
            <Text style={styles.emptyPreviewTitle}>Native build required</Text>
            <Text style={styles.emptyPreviewText}>Camera preview unavailable.</Text>
          </View>
        ) : null}
        {gridEnabled ? (
          <>
            <View style={styles.previewGuide} />
            <View style={styles.previewLineHorizontal} />
            <View style={styles.previewLineVertical} />
            <View style={[styles.gridLineVertical, { left: "33.33%" }]} />
            <View style={[styles.gridLineVertical, { left: "66.66%" }]} />
            <View style={[styles.gridLineHorizontal, { top: "33.33%" }]} />
            <View style={[styles.gridLineHorizontal, { top: "66.66%" }]} />
          </>
        ) : null}
        {countdownSeconds !== null ? (
          <Text style={styles.countdownText}>{countdownSeconds}</Text>
        ) : null}
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
            <Text style={styles.frameBadgeValue}>{videoCount}</Text>
            <Text style={styles.frameBadgeLabel}>Videos</Text>
          </View>
        </View>

        <View style={styles.cameraAppControls}>
          <View style={styles.quickToggleRow}>
            <QuickControlButton
              active={torchEnabled}
              disabled={!hasCameraPermission}
              label={torchEnabled ? "Torch On" : "Torch"}
              onPress={() => setTorchEnabled((current) => !current)}
            />
            <QuickControlButton
              active={gridEnabled}
              label={gridEnabled ? "Grid On" : "Grid"}
              onPress={() => setGridEnabled((current) => !current)}
            />
          </View>
          <View style={styles.quickZoomRow}>
            {quickZoomOptions.map((option) => (
              <QuickControlButton
                active={Math.abs(cameraZoom - option.value) < 0.03}
                key={option.label}
                label={option.label}
                onPress={() => setZoomLevel(option.value)}
              />
            ))}
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
                {captureStatus ?? `Video ${videoCount + 1}`}
              </Text>
              <Text style={styles.previewStatusValue} numberOfLines={1}>
                Clip scan
              </Text>
            </View>
            <View style={styles.coverageBadge}>
              <Text style={styles.coverageValue}>
                {videoCount > 0 ? "Ready" : "Needed"}
              </Text>
              <Text style={styles.coverageLabel}>
                {videoCount} video{videoCount === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>

          {coverageWarning ? (
            <Text style={styles.warningText}>{coverageWarning}</Text>
          ) : null}

          <View style={styles.shutterRow}>
            <Pressable
              accessibilityRole="button"
              disabled={isRecording || isBurstRunning}
              onPress={() =>
                setActiveMenu(activeMenu === "clips" ? null : "clips")
              }
              style={({ pressed }) => [
                styles.sideControl,
                activeMenu === "clips" ? styles.sideControlActive : undefined,
                pressed && !isRecording && !isBurstRunning
                  ? styles.pressed
                  : undefined
              ]}
            >
              <Text style={styles.sideControlText}>Clips</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={shutterDisabled}
              onPress={() => {
                if (!hasCameraPermission) {
                  void requestCameraPermission();
                  return;
                }

                void handlePrimaryCapture();
              }}
              style={({ pressed }) => [
                styles.shutterButton,
                isRecording ? styles.shutterButtonStop : undefined,
                shutterDisabled ? styles.shutterButtonDisabled : undefined,
                pressed && !shutterDisabled ? styles.pressed : undefined
              ]}
            >
              <View
                style={[
                  styles.shutterButtonInner,
                  isRecording
                    ? styles.shutterButtonInnerStop
                    : undefined
                ]}
              />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={videoCount === 0 || isRecording}
              onPress={handleCompleteRotation}
              style={({ pressed }) => [
                styles.sideControl,
                styles.doneControl,
                pressed && videoCount > 0 && !isRecording
                  ? styles.pressed
                  : undefined,
                videoCount === 0 || isRecording
                  ? styles.sideControlDisabled
                  : undefined
              ]}
            >
              <Text style={styles.sideControlText}>Done</Text>
            </Pressable>
          </View>

          <Text style={styles.shutterLabel}>
            {hasCameraPermission ? getPrimaryButtonLabel() : "Grant Camera Access"}
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
              <Text style={styles.menuMeta}>
                {manualControlsEnabled ? "manual" : "video"}
              </Text>
            </View>
            <View style={styles.optionGroup}>
              <Text style={styles.optionGroupTitle}>Scan</Text>
              <Text style={styles.capturePathHelp}>{captureModeCopy}</Text>
              <Text style={styles.warningText}>
                Locking camera settings improves scan consistency.
              </Text>
            </View>
            <View style={styles.optionGroup}>
              <Text style={styles.optionGroupTitle}>Exposure</Text>
              <View style={styles.optionRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={isRecording || isBurstRunning}
                  onPress={() => setManualControlsEnabled(false)}
                  style={({ pressed }) => [
                    styles.optionChip,
                    !manualControlsEnabled ? styles.optionChipActive : undefined,
                    pressed && !isRecording && !isBurstRunning
                      ? styles.pressed
                      : undefined
                  ]}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      !manualControlsEnabled
                        ? styles.optionChipTextActive
                        : undefined
                    ]}
                  >
                    Auto
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!manualSupported || isRecording || isBurstRunning}
                  onPress={() => setManualControlsEnabled(true)}
                  style={({ pressed }) => [
                    styles.optionChip,
                    manualControlsEnabled ? styles.optionChipActive : undefined,
                    !manualSupported ? styles.compactButtonDisabled : undefined,
                    pressed && manualSupported && !isRecording && !isBurstRunning
                      ? styles.pressed
                      : undefined
                  ]}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      manualControlsEnabled
                        ? styles.optionChipTextActive
                        : undefined,
                      !manualSupported ? styles.compactButtonTextDisabled : undefined
                    ]}
                  >
                    Manual
                  </Text>
                </Pressable>
              </View>
              {manualControlsEnabled ? (
                <View style={styles.manualPanel}>
                  <ManualControlRow
                    disabled={isRecording || isBurstRunning}
                    label="ISO"
                    value={`${manualIso}`}
                    onDecrease={() => setManualIsoLevel(manualIso - 100)}
                    onIncrease={() => setManualIsoLevel(manualIso + 100)}
                  />
                  <ManualControlRow
                    disabled={isRecording || isBurstRunning}
                    label="Shutter"
                    value={formatShutterSpeed(manualShutterNs)}
                    onDecrease={() => stepManualShutter(-1)}
                    onIncrease={() => stepManualShutter(1)}
                  />
                  <ManualControlRow
                    disabled={
                      isRecording || isBurstRunning || maxFocusDistance <= 0
                    }
                    label="Focus"
                    value={
                      maxFocusDistance > 0
                        ? `${manualFocusDistance.toFixed(1)}D`
                        : "Fixed"
                    }
                    onDecrease={() =>
                      setManualFocusLevel(manualFocusDistance - 0.5)
                    }
                    onIncrease={() =>
                      setManualFocusLevel(manualFocusDistance + 0.5)
                    }
                  />
                </View>
              ) : null}
            </View>
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
              <Text style={styles.capturePathHelp}>
                Record one smooth full turn per rotation. ForgeScan will derive
                turntable poses from the video timeline.
              </Text>
            </View>
            {!hasCameraPermission ? (
              <CompactMenuButton
                label="Grant Camera"
                onPress={requestCameraPermission}
              />
            ) : null}
          </View>
        ) : null}

        {activeMenu === "clips" ? (
          <View style={styles.menuPanel}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Clips</Text>
              <Text style={styles.menuMeta}>
                {videoCount} video{videoCount === 1 ? "" : "s"}
              </Text>
            </View>
            {videoCount === 0 ? (
              <View style={styles.emptyFrameList}>
                <Text style={styles.emptyFrameText}>No video captured</Text>
              </View>
            ) : null}
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
              <Text style={styles.menuTitle}>Finish</Text>
              <Text style={styles.menuMeta}>{videoCount} clip{videoCount === 1 ? "" : "s"}</Text>
            </View>
            <Text style={styles.capturePathHelp}>
              Stop recording, then complete this rotation when the clip looks good.
            </Text>
            <CompactMenuButton
              disabled={videoCount === 0 || isRecording}
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

interface QuickControlButtonProps {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}

function QuickControlButton({
  active = false,
  disabled = false,
  label,
  onPress
}: QuickControlButtonProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickControlButton,
        active ? styles.quickControlButtonActive : undefined,
        disabled ? styles.quickControlButtonDisabled : undefined,
        pressed && !disabled ? styles.pressed : undefined
      ]}
    >
      <Text
        style={[
          styles.quickControlText,
          active ? styles.quickControlTextActive : undefined,
          disabled ? styles.quickControlTextDisabled : undefined
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface ManualControlRowProps {
  disabled?: boolean;
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
  value: string;
}

function ManualControlRow({
  disabled = false,
  label,
  onDecrease,
  onIncrease,
  value
}: ManualControlRowProps): ReactElement {
  return (
    <View style={styles.manualRow}>
      <Text style={styles.manualLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onDecrease}
        style={({ pressed }) => [
          styles.manualStepButton,
          disabled ? styles.sideControlDisabled : undefined,
          pressed && !disabled ? styles.pressed : undefined
        ]}
      >
        <Text style={styles.manualStepText}>-</Text>
      </Pressable>
      <Text style={styles.manualValue}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onIncrease}
        style={({ pressed }) => [
          styles.manualStepButton,
          disabled ? styles.sideControlDisabled : undefined,
          pressed && !disabled ? styles.pressed : undefined
        ]}
      >
        <Text style={styles.manualStepText}>+</Text>
      </Pressable>
    </View>
  );
}

function formatShutterSpeed(shutterNs: number): string {
  const seconds = shutterNs / 1_000_000_000;
  if (seconds >= 1) {
    return `${seconds.toFixed(1)}s`;
  }

  return `1/${Math.round(1 / seconds)}`;
}

function createCapturePoseStatus(
  poseSynchronization: PoseSynchronization
): string {
  if (poseSynchronization === "shared-camera-synchronized") {
    return "Clip saved.";
  }

  if (poseSynchronization === "camera-photo-associated") {
    return "Clip saved.";
  }

  return "Clip saved.";
}

function PoseStat({
  label,
  value
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <View style={styles.poseStat}>
      <Text style={styles.poseStatLabel}>{label}</Text>
      <Text style={styles.poseStatValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function getTouchDistance(event: GestureResponderEvent): number | null {
  const first = event.nativeEvent.touches[0];
  const second = event.nativeEvent.touches[1];

  if (!first || !second) {
    return null;
  }

  const x = first.pageX - second.pageX;
  const y = first.pageY - second.pageY;
  return Math.sqrt(x * x + y * y);
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
  gridLineHorizontal: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    height: 1,
    position: "absolute",
    width: "100%"
  },
  gridLineVertical: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    height: "100%",
    position: "absolute",
    width: 1
  },
  countdownText: {
    color: "#ffffff",
    fontSize: 88,
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12
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
    fontSize: 21,
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
    minWidth: 58,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  frameBadgeValue: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900"
  },
  frameBadgeLabel: {
    color: "#dfece8",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  cameraAppControls: {
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  quickToggleRow: {
    flexDirection: "row",
    gap: spacing.xs
  },
  quickZoomRow: {
    alignSelf: "center",
    backgroundColor: "rgba(5, 7, 6, 0.54)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  quickControlButton: {
    alignItems: "center",
    backgroundColor: "rgba(5, 7, 6, 0.66)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 28,
    minWidth: 54,
    paddingHorizontal: spacing.xs
  },
  quickControlButtonActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff"
  },
  quickControlButtonDisabled: {
    opacity: 0.42
  },
  quickControlText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900"
  },
  quickControlTextActive: {
    color: "#101817"
  },
  quickControlTextDisabled: {
    color: "#dfece8"
  },
  captureSpacer: {
    flex: 1
  },
  bottomDock: {
    backgroundColor: "rgba(5, 7, 6, 0.68)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
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
    fontSize: 12,
    fontWeight: "900"
  },
  previewStatusValue: {
    color: "#dfece8",
    fontSize: 10,
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
  capturePathStrip: {
    flexDirection: "row",
    gap: spacing.xs
  },
  capturePathItem: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 28
  },
  capturePathItemActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff"
  },
  capturePathText: {
    color: "#dfece8",
    fontSize: 10,
    fontWeight: "900"
  },
  capturePathTextActive: {
    color: "#101817"
  },
  capturePathHelp: {
    color: "#dfece8",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13
  },
  poseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4
  },
  poseStat: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: 6,
    paddingVertical: 4,
    width: "32%"
  },
  poseStatLabel: {
    color: "rgba(255, 255, 255, 0.68)",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  poseStatValue: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 11
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
    minHeight: 28
  },
  modeItemActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff"
  },
  modeText: {
    color: "#dfece8",
    fontSize: 10,
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
    minHeight: 34,
    minWidth: 64,
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
    fontSize: 10,
    fontWeight: "900"
  },
  shutterButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderColor: "#ffffff",
    borderRadius: 999,
    borderWidth: 3,
    height: 62,
    justifyContent: "center",
    width: 62
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
    height: 44,
    width: 44
  },
  shutterButtonInnerStop: {
    backgroundColor: "#d14c40",
    borderRadius: 8,
    height: 30,
    width: 30
  },
  shutterLabel: {
    color: "#ffffff",
    fontSize: 10,
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
    minHeight: 26
  },
  toolbarItemActive: {
    backgroundColor: "#ffffff"
  },
  toolbarText: {
    color: "#dfece8",
    fontSize: 10,
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
  manualPanel: {
    gap: 4
  },
  manualRow: {
    alignItems: "center",
    backgroundColor: "#f7fafb",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 30,
    paddingHorizontal: spacing.xs
  },
  manualLabel: {
    color: colors.mutedText,
    flex: 1,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  manualValue: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
    minWidth: 54,
    textAlign: "center"
  },
  manualStepButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 30
  },
  manualStepText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 16
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
