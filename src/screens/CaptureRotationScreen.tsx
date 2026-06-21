import { useIsFocused } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CameraCapturedPicture, CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
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
import { Screen, Section } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "CaptureRotation">;
type CaptureTimingMode = "single" | "burst";
type BurstIntervalMs = 500 | 1000 | 2000;
type FocusMode = "off" | "on";

const captureModeOptions: { label: string; value: CaptureTimingMode }[] = [
  { label: "Single", value: "single" },
  { label: "Burst", value: "burst" }
];

const burstIntervalOptions: { label: string; value: BurstIntervalMs }[] = [
  { label: "0.5s", value: 500 },
  { label: "1s", value: 1000 },
  { label: "2s", value: 2000 }
];

const zoomOptions = [
  { label: "Wide", value: 0 },
  { label: "Near", value: 0.22 },
  { label: "Detail", value: 0.4 }
] as const;

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
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);
  const captureInFlightRef = useRef(false);
  const burstStopRequestedRef = useRef(false);
  const burstDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstDelayResolveRef = useRef<(() => void) | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLaunchingSystemCamera, setIsLaunchingSystemCamera] = useState(false);
  const [isBurstRunning, setIsBurstRunning] = useState(false);
  const [captureMode, setCaptureMode] =
    useState<CaptureTimingMode>("single");
  const [burstIntervalMs, setBurstIntervalMs] =
    useState<BurstIntervalMs>(1000);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [focusMode, setFocusMode] = useState<FocusMode>("off");
  const [burstStatus, setBurstStatus] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraMountError, setCameraMountError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const project = getProject(route.params.projectId);
  const rotation = project?.capture.rotations.find(
    (candidate) => candidate.id === route.params.rotationId
  );

  useEffect(() => {
    if (!isFocused) {
      setIsCameraReady(false);
    }
  }, [isFocused]);

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
  const remainingFrames = Math.max(0, targetFrameCount - frameCount);
  const canCapture = remainingFrames > 0;
  const projectId = project.project.id;
  const rotationId = rotation.id;
  const canUseCamera =
    permission?.granted === true && isCameraReady && !cameraMountError;

  function handleCompleteRotation(): void {
    completeRotation(projectId, rotationId);
    navigation.navigate("CapturePlan", { projectId });
  }

  async function handleCaptureFrame(): Promise<void> {
    await captureOneFrame();
  }

  async function handleSystemCameraCapture(): Promise<void> {
    if (!canCapture || isLaunchingSystemCamera || isBurstRunning) {
      return;
    }

    setCaptureError(null);
    setIsLaunchingSystemCamera(true);

    try {
      const systemPermission = await ImagePicker.requestCameraPermissionsAsync();

      if (!systemPermission.granted) {
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

      await saveImagePickerFrame(result.assets[0]);
    } catch (error: unknown) {
      setCaptureError(
        error instanceof Error
          ? error.message
          : "System camera capture failed."
      );
    } finally {
      setIsLaunchingSystemCamera(false);
    }
  }

  async function saveImagePickerFrame(
    asset: ImagePicker.ImagePickerAsset
  ): Promise<void> {
    await addCapturedFrame(projectId, rotationId, {
      uri: asset.uri,
      ...(asset.width > 0 ? { width: asset.width } : {}),
      ...(asset.height > 0 ? { height: asset.height } : {})
    });
  }

  async function captureOneFrame(): Promise<boolean> {
    if (
      !cameraRef.current ||
      !canCapture ||
      !canUseCamera ||
      captureInFlightRef.current
    ) {
      return false;
    }

    captureInFlightRef.current = true;
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
      return true;
    } catch (error: unknown) {
      setCaptureError(
        error instanceof Error ? error.message : "Frame capture failed."
      );
      return false;
    } finally {
      captureInFlightRef.current = false;
      setIsCapturing(false);
    }
  }

  async function handleStartBurst(): Promise<void> {
    if (!canUseCamera || !canCapture || isBurstRunning) {
      return;
    }

    const framesToCapture = remainingFrames;
    burstStopRequestedRef.current = false;
    setCaptureError(null);
    setIsBurstRunning(true);

    try {
      for (let frameNumber = 1; frameNumber <= framesToCapture; frameNumber += 1) {
        if (burstStopRequestedRef.current) {
          break;
        }

        setBurstStatus(`Burst ${frameNumber}/${framesToCapture}`);
        const didCapture = await captureOneFrame();

        if (!didCapture || burstStopRequestedRef.current) {
          break;
        }

        if (frameNumber < framesToCapture) {
          await waitForBurstInterval(burstIntervalMs);
        }
      }
    } finally {
      clearBurstDelay();
      burstStopRequestedRef.current = false;
      setBurstStatus(null);
      setIsBurstRunning(false);
    }
  }

  function handleStopBurst(): void {
    burstStopRequestedRef.current = true;
    setBurstStatus("Stopping burst");
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
        {isFocused ? (
          <CameraView
            key={`${projectId}-${rotationId}`}
            ref={cameraRef}
            autofocus={focusMode}
            enableTorch={torchEnabled}
            facing="back"
            onCameraReady={() => {
              setIsCameraReady(true);
              setCameraMountError(null);
            }}
            onMountError={(event) => {
              setIsCameraReady(false);
              setCameraMountError(event.message);
            }}
            style={styles.cameraView}
            zoom={zoomLevel}
          />
        ) : null}
        <View pointerEvents="none" style={styles.cameraOverlay}>
          {!isCameraReady && !cameraMountError ? (
            <Text style={styles.previewStatus}>Starting camera</Text>
          ) : null}
          <View style={styles.guideCircle} />
          <View style={styles.guideLineHorizontal} />
          <View style={styles.guideLineVertical} />
          <View style={styles.overlayTop}>
            <Text style={styles.overlayTitle}>{activeRotation.label}</Text>
            <View style={styles.overlayMetaRow}>
              <Text style={styles.overlayMeta}>
                {frameCount}/{targetFrameCount} frames
              </Text>
              <Text style={styles.overlayBadge}>
                {captureMode === "burst" ? `${burstIntervalMs / 1000}s` : "Single"}
              </Text>
            </View>
            {burstStatus ? (
              <Text style={styles.overlayStatus}>{burstStatus}</Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screenRoot}>
      <View style={styles.headerSection}>
        <Text style={styles.title}>{rotation.label}</Text>
        <Text style={styles.meta}>{rotation.angleHint}</Text>
      </View>

      {renderCamera()}

      <ScrollView contentContainerStyle={styles.controlContent}>
        <Section>
          <View style={styles.counterRow}>
            <View>
              <Text style={styles.counterLabel}>Frames</Text>
              <Text style={styles.counterSubLabel}>
                {remainingFrames} remaining
              </Text>
            </View>
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
          {cameraMountError ? (
            <Text style={styles.errorMessage}>
              Camera preview error: {cameraMountError}
            </Text>
          ) : null}
          {captureError ? (
            <Text style={styles.errorMessage}>{captureError}</Text>
          ) : null}
        </Section>

        <Section>
          <View style={styles.captureConsole}>
            <View style={styles.consoleHeader}>
              <Text style={styles.consoleTitle}>Capture</Text>
              {isBurstRunning ? (
                <Text style={styles.livePill}>Burst active</Text>
              ) : null}
            </View>

            <View style={styles.segmentedControl}>
              {captureModeOptions.map((option) => (
                <ToggleOption
                  disabled={isBurstRunning}
                  key={option.value}
                  label={option.label}
                  selected={captureMode === option.value}
                  onPress={() => setCaptureMode(option.value)}
                />
              ))}
            </View>

            {captureMode === "burst" ? (
              <View style={styles.optionBlock}>
                <Text style={styles.optionLabel}>Interval</Text>
                <View style={styles.chipRow}>
                  {burstIntervalOptions.map((option) => (
                    <ChipOption
                      disabled={isBurstRunning}
                      key={option.value}
                      label={option.label}
                      selected={burstIntervalMs === option.value}
                      onPress={() => setBurstIntervalMs(option.value)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.optionBlock}>
              <Text style={styles.optionLabel}>Camera</Text>
              <View style={styles.cameraControlGrid}>
                <DeviceOption
                  disabled={isBurstRunning}
                  label={torchEnabled ? "Torch On" : "Torch Off"}
                  selected={torchEnabled}
                  onPress={() => setTorchEnabled((enabled) => !enabled)}
                />
                <DeviceOption
                  disabled={isBurstRunning}
                  label={focusMode === "on" ? "AF Lock" : "AF Auto"}
                  selected={focusMode === "on"}
                  onPress={() =>
                    setFocusMode((mode) => (mode === "off" ? "on" : "off"))
                  }
                />
              </View>
              <Button
                disabled={!canCapture || isLaunchingSystemCamera || isBurstRunning}
                label={
                  isLaunchingSystemCamera
                    ? "Opening System Camera"
                    : "Use System Camera"
                }
                variant="secondary"
                onPress={handleSystemCameraCapture}
              />
            </View>

            <View style={styles.optionBlock}>
              <Text style={styles.optionLabel}>Zoom</Text>
              <View style={styles.chipRow}>
                {zoomOptions.map((option) => (
                  <ChipOption
                    disabled={isBurstRunning}
                    key={option.label}
                    label={option.label}
                    selected={zoomLevel === option.value}
                    onPress={() => setZoomLevel(option.value)}
                  />
                ))}
              </View>
            </View>
          </View>
        </Section>

        <Section>
          {captureMode === "burst" ? (
            <Button
              disabled={!isBurstRunning && (!canCapture || !canUseCamera)}
              label={
                isBurstRunning
                  ? "Stop Burst"
                  : canCapture
                    ? `Start Burst (${remainingFrames})`
                    : "Frame Target Reached"
              }
              variant={isBurstRunning ? "danger" : "primary"}
              onPress={isBurstRunning ? handleStopBurst : handleStartBurst}
            />
          ) : (
            <Button
              disabled={
                !canCapture ||
                isCapturing ||
                isLaunchingSystemCamera ||
                isBurstRunning ||
                !canUseCamera
              }
              label={
                canCapture
                  ? isCapturing
                    ? "Capturing"
                    : "Capture Frame"
                  : "Frame Target Reached"
              }
              onPress={handleCaptureFrame}
            />
          )}
          <Button
            disabled={
              frameCount === 0 ||
              isBurstRunning ||
              isCapturing ||
              isLaunchingSystemCamera
            }
            label="Retake Last Frame"
            variant="secondary"
            onPress={() => retakeLastFrame(projectId, rotationId)}
          />
          <Button
            disabled={
              frameCount === 0 ||
              isBurstRunning ||
              isCapturing ||
              isLaunchingSystemCamera
            }
            label="Complete Rotation"
            variant="secondary"
            onPress={handleCompleteRotation}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

interface OptionProps {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}

function ToggleOption({
  label,
  selected,
  disabled,
  onPress
}: OptionProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentButton,
        selected ? styles.segmentButtonActive : undefined,
        pressed && !disabled ? styles.pressed : undefined,
        disabled ? styles.segmentButtonDisabled : undefined
      ]}
    >
      <Text
        style={[
          styles.segmentLabel,
          selected ? styles.segmentLabelActive : undefined
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ChipOption({
  label,
  selected,
  disabled,
  onPress
}: OptionProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipActive : undefined,
        pressed && !disabled ? styles.pressed : undefined,
        disabled ? styles.chipDisabled : undefined
      ]}
    >
      <Text
        style={[styles.chipLabel, selected ? styles.chipLabelActive : undefined]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DeviceOption({
  label,
  selected,
  disabled,
  onPress
}: OptionProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.deviceButton,
        selected ? styles.deviceButtonActive : undefined,
        pressed && !disabled ? styles.pressed : undefined,
        disabled ? styles.chipDisabled : undefined
      ]}
    >
      <Text
        style={[
          styles.deviceButtonLabel,
          selected ? styles.deviceButtonLabelActive : undefined
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    backgroundColor: colors.background,
    flex: 1
  },
  headerSection: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md
  },
  controlContent: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xl
  },
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
    marginHorizontal: spacing.md,
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
  previewStatus: {
    backgroundColor: "rgba(20, 27, 25, 0.72)",
    borderRadius: 8,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: "absolute",
    zIndex: 2
  },
  overlayTop: {
    backgroundColor: "rgba(20, 27, 25, 0.72)",
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
  overlayMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginTop: 4
  },
  overlayMeta: {
    color: "#dfece8",
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700"
  },
  overlayBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3
  },
  overlayStatus: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    marginTop: spacing.xs
  },
  guideCircle: {
    borderColor: "rgba(255, 255, 255, 0.9)",
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
    marginHorizontal: spacing.md,
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
  counterSubLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2
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
  captureConsole: {
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
  consoleHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  consoleTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  livePill: {
    backgroundColor: "#e5f2ec",
    borderRadius: 999,
    color: colors.success,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  segmentedControl: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    flexDirection: "row",
    padding: 4
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    justifyContent: "center",
    minHeight: 40
  },
  segmentButtonActive: {
    backgroundColor: colors.text
  },
  segmentButtonDisabled: {
    opacity: 0.72
  },
  segmentLabel: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: "800"
  },
  segmentLabelActive: {
    color: "#ffffff"
  },
  optionBlock: {
    gap: spacing.xs
  },
  optionLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  chip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 72,
    paddingHorizontal: spacing.md
  },
  chipActive: {
    backgroundColor: "#ecf6f6",
    borderColor: colors.accent
  },
  chipDisabled: {
    opacity: 0.58
  },
  chipLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  chipLabelActive: {
    color: colors.accent
  },
  cameraControlGrid: {
    flexDirection: "row",
    gap: spacing.sm
  },
  deviceButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.sm
  },
  deviceButtonActive: {
    backgroundColor: colors.text,
    borderColor: colors.text
  },
  deviceButtonLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  deviceButtonLabelActive: {
    color: "#ffffff"
  },
  pressed: {
    opacity: 0.78
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
