import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { File } from "expo-file-system";
import { ReactElement, useState } from "react";
import { NativeModules, Platform, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import {
  getNativeKsplatOptimizerAvailability,
  runNativeGaussianTrainingSmokeTest,
  runNativeKsplatSmokeTest
} from "../native/NativeKsplatOptimizer";
import { NativeKsplatOptimizerAvailability } from "../native/NativeKsplatOptimizerTypes";
import {
  getNativeMaskingAvailability,
  runNativeBiRefNetMaskingSmokeTest,
  runNativeMaskingSmokeTest
} from "../native/NativeMasking";
import { NativeMaskingAvailability } from "../native/NativeMaskingTypes";
import { validateProjectForReconstruction } from "../core/frameValidation";
import { runMaskingForProject } from "../masking/MaskingEngine";
import {
  getCurrentPlatformEngine,
  getRuntimePlatformLabel,
  platformReconstructionEngines
} from "../reconstruction/engineRegistry";
import { runKsplatGeneration } from "../splatting/NativeKsplatEngine";
import { validateKsplatFile } from "../splatting/KsplatValidation";
import { useProjects } from "../state/ProjectContext";
import { CapabilityStatus } from "../reconstruction/types";
import {
  getReactNativeArchitectureReason,
  getReactNativeArchitectureStatus
} from "../runtime/RuntimeStatuses";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "DeviceSupport">;

export function DeviceSupportScreen(_props: Props): ReactElement {
  const { projects } = useProjects();
  const latestProject = projects[0];
  const currentEngine = getCurrentPlatformEngine();
  const currentPlatformLabel = getRuntimePlatformLabel();
  const hasForgeScanNativeModules = Boolean(
    NativeModules.ForgeScanNativeMasking ||
      NativeModules.ForgeScanKsplatOptimizer
  );
  const [isRunning, setIsRunning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticRow[]>([]);
  const [lastNativeError, setLastNativeError] = useState<string>("None");
  const [maskingAvailability, setMaskingAvailability] =
    useState<NativeMaskingAvailability | null>(null);
  const [optimizerAvailability, setOptimizerAvailability] =
    useState<NativeKsplatOptimizerAvailability | null>(null);
  const [maskTestStatus, setMaskTestStatus] = useState<SmokeStatus>("not run");
  const [trainingSmokeStatus, setTrainingSmokeStatus] =
    useState<SmokeStatus>("not run");
  const [splatSmokeStatus, setSplatSmokeStatus] = useState<SmokeStatus>("not run");
  const [lastKsplat, setLastKsplat] = useState<LastKsplatStatus | null>(null);
  const architectureStatus = getReactNativeArchitectureStatus(
    false
  );
  const androidDevBuildDetected =
    Platform.OS !== "android"
      ? "unknown"
      : hasForgeScanNativeModules
        ? "yes"
        : "no";

  async function runDiagnostic(
    label: string,
    action: () => Promise<DiagnosticRow[]>
  ): Promise<void> {
    setIsRunning(true);
    try {
      const rows = await action();
      setDiagnostics((current) => [
        ...current.filter((row) => row.group !== label),
        ...rows.map((row) => ({ ...row, group: label }))
      ]);
      const failed = rows.find((row) => row.status === "fail");
      setLastNativeError(failed?.detail ?? "None");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : `${label} failed.`;
      setLastNativeError(message);
      setDiagnostics((current) => [
        ...current.filter((row) => row.group !== label),
        { group: label, label, status: "fail", detail: message }
      ]);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>Android and iOS versions</Text>
        <Text style={styles.meta}>
          Current runtime: {currentPlatformLabel}
        </Text>
      </Section>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {currentEngine
            ? `${currentEngine.displayName} is selected for this device.`
            : "This preview runtime uses shared capture only."}
        </Text>
        <Text style={styles.summaryMeta}>
          Android V1 can use BiRefNet ONNX when the model is present,
          temporary DeepLab as fallback, and trainable Gaussian Splat V1.
          Production 3DGS is not implemented.
        </Text>
      </View>

      <Section>
        <Text style={styles.sectionTitle}>Native Engine Diagnostics</Text>
        <View style={styles.platformCard}>
          <DiagnosticLine
            label="Android dev build detected"
            value={androidDevBuildDetected}
          />
          <DiagnosticLine
            label="Runtime"
            value={hasForgeScanNativeModules ? "Dev build / native" : "Expo Go / JS runtime"}
          />
          <DiagnosticLine label="Platform" value={Platform.OS} />
          <DiagnosticLine
            label="React Native New Architecture"
            value={architectureStatus}
          />
          <DiagnosticLine
            label="Architecture reason"
            value={getReactNativeArchitectureReason(architectureStatus)}
          />
          <DiagnosticLine
            label="Temporary DeepLab model"
            value={formatPresence(maskingAvailability?.temporaryDeepLabModelPresent)}
          />
          <DiagnosticLine
            label="BiRefNet model"
            value={formatPresence(maskingAvailability?.birefnetModelPresent)}
          />
          <DiagnosticLine
            label="BiRefNet setup command"
            value="npm run model:birefnet:install"
          />
          <DiagnosticLine
            label="Active masking engine"
            value={maskingAvailability?.activeMaskingEngine ?? "unknown"}
          />
          <DiagnosticLine
            label="Masking fallback used"
            value={
              maskingAvailability?.fallbackUsed === undefined
                ? "unknown"
                : maskingAvailability.fallbackUsed
                  ? "yes"
                  : "no"
            }
          />
          <DiagnosticLine label="One-frame BiRefNet mask test" value={maskTestStatus} />
          <DiagnosticLine
            label="Trainable Gaussian V1 engine"
            value={
              optimizerAvailability
                ? optimizerAvailability.available
                  ? "available"
                  : "unavailable"
                : "unknown"
            }
          />
          <DiagnosticLine label="Tiny Gaussian training test" value={trainingSmokeStatus} />
          <DiagnosticLine label="Tiny .ksplat writer test" value={splatSmokeStatus} />
          <DiagnosticLine
            label="Optimizer runtime"
            value={optimizerAvailability?.optimizerRuntimeStatus ?? "unknown"}
          />
          <DiagnosticLine
            label="Optimizer blocker"
            value={optimizerAvailability?.optimizerBlocker ?? "unknown"}
          />
          <DiagnosticLine
            label="Last .ksplat generated"
            value={
              lastKsplat
                ? `${lastKsplat.path} / ${lastKsplat.size} bytes / ${lastKsplat.qualityTier}`
                : "not run"
            }
          />
          <DiagnosticLine label="Production 3DGS" value="not implemented" />
          <DiagnosticLine
            label="MP4/GIF preview rendering"
            value="not implemented"
          />
          <DiagnosticLine label="Last native error" value={lastNativeError} />
          <Button
            disabled={isRunning}
            label="Test BiRefNet Model Load"
            variant="secondary"
            onPress={() => {
              void runDiagnostic("BiRefNet model load", async () => {
                const availability = await getNativeMaskingAvailability();
                setMaskingAvailability(availability);
                return [
                  {
                    label: "Native masking module installed",
                    status: availability.available ? "pass" : "fail",
                    detail: availability.available ? "yes" : "no"
                  },
                  {
                    label: "BiRefNet model exists",
                    status: availability.birefnetModelPresent ? "pass" : "fail",
                    detail: availability.birefnetModelPresent
                      ? "yes"
                      : "BiRefNet model is missing. Add the model at assets/models/masking/birefnet.onnx."
                  },
                  {
                    label: "Temporary DeepLab model",
                    status: availability.temporaryDeepLabModelPresent ? "warn" : "fail",
                    detail: formatPresence(availability.temporaryDeepLabModelPresent)
                  },
                  {
                    label: "BiRefNet loaded",
                    status: availability.birefnetLoaded ? "pass" : "fail",
                    detail: availability.birefnetLoaded
                      ? availability.modelName ?? "loaded"
                      : availability.reason ??
                        "BiRefNet model is missing. Add the model at assets/models/masking/birefnet.onnx."
                  },
                  {
                    label: "Inference backend",
                    status: availability.inferenceBackend === "tflite" ? "pass" : "warn",
                    detail: availability.inferenceBackend ?? "unknown"
                  },
                  {
                    label: "Active masking engine",
                    status:
                      availability.maskingEngineStatus === "birefnet-running"
                        ? "pass"
                        : availability.maskingEngineStatus === "temporary-deeplab-fallback"
                          ? "warn"
                          : "fail",
                    detail:
                      availability.maskingEngineStatus ??
                      availability.engineName ??
                      "unavailable"
                  },
                  {
                    label: "Fallback used",
                    status: availability.fallbackUsed ? "warn" : "pass",
                    detail: availability.fallbackUsed ? "yes" : "no"
                  }
                ];
              });
            }}
          />
          <Button
            disabled={isRunning}
            label="Run One-Frame BiRefNet Mask Test"
            variant="secondary"
            onPress={() => {
              void runDiagnostic("One-frame BiRefNet mask", async () => {
                const result = await runNativeBiRefNetMaskingSmokeTest();
                const passed =
                  result.status === "pass" &&
                  Boolean(result.birefnetInferencePassed) &&
                  (result.maskBytes ?? 0) > 0;
                setMaskTestStatus(passed ? "passed" : "failed");
                return [
                  {
                    label: "BiRefNet inference",
                    status: result.birefnetInferencePassed ? "pass" : "fail",
                    detail:
                      result.birefnetInferencePassed
                        ? `${result.engineName ?? "BiRefNet"} inference passed`
                        : result.warnings.join(" ") || result.errors.join(" ")
                  },
                  {
                    label: "Mask PNG written",
                    status:
                      result.maskPngWritten && (result.maskBytes ?? 0) > 0
                        ? "pass"
                        : "fail",
                    detail: `${result.maskBytes ?? 0} bytes`
                  },
                  {
                    label: "Mask output path",
                    status: result.maskUri ? "pass" : "fail",
                    detail: result.maskUri ?? "no mask output"
                  },
                  {
                    label: "BiRefNet model status",
                    status: result.birefnetLoaded ? "pass" : "fail",
                    detail: `${result.modelName ?? "unknown"} / ${result.modelStatus ?? "unknown"}`
                  }
                ];
              });
            }}
          />
          <Button
            disabled={isRunning}
            label="Test Gaussian Splat Optimizer"
            variant="secondary"
            onPress={() => {
              void runDiagnostic("Gaussian optimizer", async () => {
                const availability = await getNativeKsplatOptimizerAvailability();
                setOptimizerAvailability(availability);
                return [
                  {
                    label: "Native optimizer module installed",
                    status: availability.available ? "pass" : "fail",
                    detail: availability.available ? "yes" : "no"
                  },
                  {
                    label: "Optimizer can create output directory",
                    status: availability.canCreateOutputDirectory ? "pass" : "fail",
                    detail: availability.canCreateOutputDirectory ? "yes" : "no"
                  },
                  {
                    label: ".ksplat writer available",
                    status: availability.writerAvailable ? "pass" : "fail",
                    detail: availability.writerAvailable ? "yes" : "no"
                  },
                  {
                    label: "Optimizer backend",
                    status:
                      availability.optimizerName === "trainable-3dgs-android-v1"
                        ? "pass"
                      : "fail",
                    detail: availability.optimizerName ?? "unavailable"
                  },
                  {
                    label: "Trainable loop available",
                    status:
                      availability.trainableLoopAvailable
                        ? "pass"
                        : "fail",
                    detail: availability.ksplatEngineStatus ?? "unknown"
                  },
                  {
                    label: "Optimizer runtime status",
                    status:
                      availability.optimizerRuntimeStatus === "trainable-loop-available"
                        ? "pass"
                        : "fail",
                    detail: availability.optimizerRuntimeStatus ?? "unknown"
                  },
                  {
                    label: "Optimizer blocker",
                    status:
                      !availability.optimizerBlocker ||
                      availability.optimizerBlocker === "none"
                        ? "pass"
                        : "fail",
                    detail: availability.optimizerBlocker ?? "none"
                  },
                  {
                    label: "Coarse fallback available",
                    status: availability.coarseFallbackAvailable ? "warn" : "fail",
                    detail: availability.coarseFallbackAvailable ? "yes" : "no"
                  },
                  {
                    label: ".ksplat writer status",
                    status:
                      availability.ksplatWriterStatus === "experimental-ksplat"
                        ? "warn"
                        : availability.ksplatWriterStatus === "valid-ksplat"
                          ? "pass"
                          : "fail",
                    detail: availability.ksplatWriterStatus ?? "unknown"
                  },
                  {
                    label: "Production 3DGS",
                    status: availability.production3dgs ? "pass" : "warn",
                    detail: availability.production3dgs
                      ? "implemented"
                      : "not implemented"
                  }
                ];
              });
            }}
          />
          <Button
            disabled={isRunning}
            label="Run Tiny Gaussian Training Test"
            variant="secondary"
            onPress={() => {
              void runDiagnostic("Tiny Gaussian training", async () => {
                const result = await runNativeGaussianTrainingSmokeTest();
                setTrainingSmokeStatus(result.status === "pass" ? "passed" : "failed");
                if (result.ksplatUri && result.ksplatBytes !== undefined) {
                  setLastKsplat({
                    path: result.ksplatUri,
                    size: result.ksplatBytes,
                    qualityTier: result.qualityTier ?? "trainable-v1"
                  });
                }
                return [
                  {
                    label: "Tiny trainable optimization",
                    status: result.status === "pass" ? "pass" : "fail",
                    detail:
                      result.status === "pass"
                        ? `${result.iterationCount ?? 0} iterations / ${result.gaussianCount ?? 0} gaussians / loss ${formatNumber(result.finalLoss)}`
                        : result.warnings.join(" ") || result.errors.join(" ")
                  },
                  {
                    label: "Optimizer blocker",
                    status:
                      !result.optimizerBlocker || result.optimizerBlocker === "none"
                        ? "pass"
                        : "fail",
                    detail: result.optimizerBlocker ?? "none"
                  },
                  {
                    label: ".ksplat smoke output",
                    status: (result.ksplatBytes ?? 0) > 0 ? "pass" : "fail",
                    detail: `${result.ksplatUri ?? "none"} / ${result.ksplatBytes ?? 0} bytes`
                  },
                  {
                    label: ".ksplat writer status",
                    status:
                      result.ksplatWriterStatus === "experimental-ksplat"
                        ? "warn"
                        : result.ksplatWriterStatus === "valid-ksplat"
                          ? "pass"
                          : "fail",
                    detail: result.ksplatWriterStatus ?? "unknown"
                  }
                ];
              });
            }}
          />
          <Button
            disabled={isRunning}
            label="Run Tiny .ksplat Writer Test"
            variant="secondary"
            onPress={() => {
              void runDiagnostic("Tiny splat", async () => {
                const result = await runNativeKsplatSmokeTest();
                setSplatSmokeStatus(result.status === "pass" ? "passed" : "failed");
                if (result.ksplatUri && result.ksplatBytes !== undefined) {
                  setLastKsplat({
                    path: result.ksplatUri,
                    size: result.ksplatBytes,
                    qualityTier: result.qualityTier ?? "smoke-test"
                  });
                }
                return [
                  {
                    label: "Optimizer smoke test",
                    status: result.status === "pass" ? "pass" : "fail",
                    detail:
                      result.status === "pass"
                        ? `.ksplat ${result.ksplatBytes ?? 0} bytes`
                        : result.warnings.join(" ") || result.errors.join(" ")
                  },
                  {
                    label: ".ksplat writer available",
                    status: result.writerAvailable ? "pass" : "fail",
                    detail: result.writerAvailable ? "yes" : "no"
                  },
                  {
                    label: ".ksplat writer status",
                    status:
                      result.ksplatWriterStatus === "experimental-ksplat"
                        ? "warn"
                        : result.ksplatWriterStatus === "valid-ksplat"
                          ? "pass"
                          : "fail",
                    detail: result.ksplatWriterStatus ?? "unknown"
                  }
                ];
              });
            }}
          />
          <Button
            disabled={isRunning}
            label="Run Full Android Scan Test"
            variant="secondary"
            onPress={() => {
              void runDiagnostic("Android V1 scan", async () => {
                if (!latestProject) {
                  return [
                    {
                      label: "Active scan",
                      status: "fail",
                      detail: "Create or load a scan first."
                    }
                  ];
                }

                const frameCount = latestProject.capture.rotations.reduce(
                  (sum, rotation) => sum + rotation.frames.length,
                  0
                );
                if (frameCount === 0) {
                  return [
                    {
                      label: "Captured frames",
                      status: "fail",
                      detail: "no captured frames"
                    }
                  ];
                }

                const validation = validateProjectForReconstruction(latestProject);
                if (!validation.validForReconstruction) {
                  if (validation.quality.requiredRotationsComplete === "fail") {
                    return [
                      {
                        label: "Capture validation",
                        status: "fail",
                        detail: "required rotation incomplete"
                      }
                    ];
                  }

                  return validation.errors.map((error) => ({
                    label: "Capture validation",
                    status: "fail" as const,
                    detail: error
                  }));
                }

                const availability = await getNativeMaskingAvailability();
                setMaskingAvailability(availability);
                if (!availability.modelLoaded) {
                  return [
                    {
                      label: "Masking model",
                      status: "fail",
                      detail: availability.modelExists
                        ? "bad model load"
                        : "masking model missing"
                    }
                  ];
                }

                const masking = await runMaskingForProject(latestProject);
                const firstRealMask = masking.artifacts.find(
                  (artifact) =>
                    artifact.status === "complete" &&
                    artifact.inferenceRan &&
                    getFileSize(artifact.refinedMaskUri) > 0
                );
                if (!firstRealMask) {
                  return [
                    {
                      label: "Mask output",
                      status: "fail",
                      detail: "mask output missing"
                    }
                  ];
                }

                const result = await runKsplatGeneration(
                  latestProject,
                  masking.artifacts
                );
                const fileValidation = validateKsplatFile(result.ksplatUri);
                const ksplatSize = getFileSize(result.ksplatUri);

                if (result.status !== "generated") {
                  return [
                    {
                      label: "Coarse splat V1",
                      status: "fail",
                      detail: "coarse splat V1 failed"
                    },
                    {
                      label: "Native error",
                      status: "fail",
                      detail:
                        [...result.errors, ...result.warnings].join(" ") ||
                        "No native optimizer detail returned."
                    }
                  ];
                }
                if (!result.ksplatUri || !fileValidation.valid) {
                  return [
                    {
                      label: ".ksplat validation",
                      status: "fail",
                      detail: ".ksplat missing"
                    }
                  ];
                }
                if (ksplatSize <= 0) {
                  return [
                    {
                      label: ".ksplat size",
                      status: "fail",
                      detail: ".ksplat zero bytes"
                    }
                  ];
                }

                setLastKsplat({
                  path: result.ksplatUri,
                  size: ksplatSize,
                  qualityTier: result.qualityTier ?? "coarse-v1"
                });

                return [
                  {
                    label: "Gaussian optimizer",
                    status:
                      result.optimizerName === "trainable-3dgs-android-v1" ||
                      result.optimizerName === "coarse-on-device-splat-v1"
                        ? "pass"
                        : "fail",
                    detail: result.optimizerName ?? "unavailable"
                  },
                  {
                    label: "Quality tier",
                    status:
                      result.qualityTier === "trainable-v1"
                        ? "pass"
                        : result.qualityTier === "coarse-v1"
                          ? "warn"
                          : "fail",
                    detail: result.qualityTier ?? "none"
                  },
                  {
                    label: "Training stats",
                    status: result.qualityTier === "trainable-v1" ? "pass" : "warn",
                    detail: `${result.iterationCount ?? 0} iterations / ${result.gaussianCount ?? 0} gaussians / loss ${formatNumber(result.finalLoss)}`
                  },
                  {
                    label: "Optimizer runtime status",
                    status:
                      result.optimizerRuntimeStatus === "trainable-loop-complete"
                        ? "pass"
                        : result.optimizerRuntimeStatus === "coarse-fallback-complete"
                          ? "warn"
                          : "fail",
                    detail: result.optimizerRuntimeStatus ?? "unknown"
                  },
                  {
                    label: "Optimizer blocker",
                    status:
                      !result.optimizerBlocker || result.optimizerBlocker === "none"
                        ? "pass"
                        : "warn",
                    detail: result.optimizerBlocker ?? "none"
                  },
                  {
                    label: ".ksplat scan output",
                    status: "pass",
                    detail: `${result.ksplatUri} / ${ksplatSize} bytes`
                  },
                  {
                    label: ".ksplat writer status",
                    status:
                      result.ksplatWriterStatus === "experimental-ksplat"
                        ? "warn"
                        : result.ksplatWriterStatus === "valid-ksplat"
                          ? "pass"
                          : "fail",
                    detail: result.ksplatWriterStatus ?? "unknown"
                  },
                  {
                    label: "Masking engine",
                    status:
                      masking.maskingEngineStatus === "birefnet-complete"
                        ? "pass"
                        : masking.maskingEngineStatus === "temporary-deeplab-fallback"
                          ? "warn"
                          : "fail",
                    detail: masking.maskingEngineStatus ?? masking.engineName
                  },
                  {
                    label: "Mask output",
                    status: "pass",
                    detail: `${firstRealMask.refinedMaskUri} / ${getFileSize(firstRealMask.refinedMaskUri)} bytes`
                  },
                  {
                    label: "Production 3DGS",
                    status: result.production3dgs ? "pass" : "warn",
                    detail: result.production3dgs
                      ? "yes"
                      : "Not production Gaussian Splat training."
                  }
                ];
              });
            }}
          />
          <View style={styles.capabilityList}>
            {diagnostics.map((row) => (
              <View key={`${row.group}-${row.label}`} style={styles.capabilityRow}>
                <View style={styles.capabilityText}>
                  <Text style={styles.capabilityTitle}>{row.label}</Text>
                  <Text style={styles.capabilityDetail}>{row.detail}</Text>
                </View>
                <DiagnosticBadge status={row.status} />
              </View>
            ))}
          </View>
        </View>
      </Section>

      <Section>
        {platformReconstructionEngines.map((engine) => (
          <View key={engine.platform} style={styles.platformCard}>
            <View style={styles.platformHeader}>
              <View style={styles.platformTitleGroup}>
                <Text style={styles.platformTitle}>{engine.displayName}</Text>
                <Text style={styles.platformMeta}>
                  Module: {engine.nativeModuleName}
                </Text>
              </View>
              <StatusLabel status={engine.implementationStatus} />
            </View>

            <Text style={styles.platformSummary}>{engine.summary}</Text>

            <View style={styles.capabilityList}>
              {engine.capabilities.map((capability) => (
                <View key={capability.id} style={styles.capabilityRow}>
                  <View style={styles.capabilityText}>
                    <Text style={styles.capabilityTitle}>
                      {capability.label}
                    </Text>
                    <Text style={styles.capabilityDetail}>
                      {capability.detail}
                    </Text>
                  </View>
                  <CapabilityBadge status={capability.status} />
                </View>
              ))}
            </View>

            <View style={styles.roadmapList}>
              {engine.roadmap.map((item) => (
                <View key={item.order} style={styles.roadmapRow}>
                  <Text style={styles.roadmapNumber}>{item.order}</Text>
                  <View style={styles.roadmapText}>
                    <Text style={styles.roadmapTitle}>{item.title}</Text>
                    <Text style={styles.roadmapDetail}>{item.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </Section>
    </Screen>
  );
}

interface DiagnosticRow {
  group?: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
}

type DiagnosticStatus = "pass" | "warn" | "fail";
type SmokeStatus = "not run" | "passed" | "failed";

interface LastKsplatStatus {
  path: string;
  size: number;
  qualityTier: string;
}

function formatPresence(value: boolean | undefined): string {
  if (value === true) {
    return "present";
  }

  if (value === false) {
    return "missing";
  }

  return "unknown";
}

function getFileSize(uri: string | undefined): number {
  if (!uri) {
    return 0;
  }

  try {
    const file = new File(uri);
    return file.exists ? file.size : 0;
  } catch {
    return 0;
  }
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return value.toFixed(4);
}

interface DiagnosticLineProps {
  label: string;
  value: string;
}

function DiagnosticLine({ label, value }: DiagnosticLineProps): ReactElement {
  return (
    <View style={styles.diagnosticLine}>
      <Text style={styles.capabilityTitle}>{label}</Text>
      <Text style={styles.capabilityDetail}>{value}</Text>
    </View>
  );
}

function DiagnosticBadge({ status }: { status: DiagnosticStatus }): ReactElement {
  return (
    <View
      style={[
        styles.badge,
        status === "pass"
          ? styles.available
          : status === "warn"
            ? styles.warningBadge
            : styles.unsupported
      ]}
    >
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
}

interface CapabilityBadgeProps {
  status: CapabilityStatus;
}

function CapabilityBadge({ status }: CapabilityBadgeProps): ReactElement {
  return (
    <View style={[styles.badge, styles[status]]}>
      <Text style={styles.badgeText}>{formatStatus(status)}</Text>
    </View>
  );
}

interface StatusLabelProps {
  status: string;
}

function StatusLabel({ status }: StatusLabelProps): ReactElement {
  return (
    <View style={[styles.badge, styles.statusBadge]}>
      <Text style={styles.badgeText}>{formatStatus(status)}</Text>
    </View>
  );
}

function formatStatus(status: string): string {
  return status.replace(/-/g, " ");
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
  summary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  summaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  summaryMeta: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  platformCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  platformHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  platformTitleGroup: {
    flex: 1,
    gap: 2
  },
  platformTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  platformMeta: {
    color: colors.mutedText,
    fontSize: 13
  },
  platformSummary: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  capabilityList: {
    gap: spacing.sm
  },
  diagnosticLine: {
    borderColor: colors.border,
    borderBottomWidth: 1,
    gap: 2,
    paddingBottom: spacing.sm
  },
  capabilityRow: {
    alignItems: "flex-start",
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingTop: spacing.sm
  },
  capabilityText: {
    flex: 1,
    gap: 2
  },
  capabilityTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  capabilityDetail: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  badgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  available: {
    backgroundColor: "#d9eadf"
  },
  "requires-native-build": {
    backgroundColor: "#efe5d2"
  },
  planned: {
    backgroundColor: "#dfece8"
  },
  unsupported: {
    backgroundColor: "#f0d8d5"
  },
  warningBadge: {
    backgroundColor: "#efe5d2"
  },
  statusBadge: {
    backgroundColor: colors.surfaceMuted
  },
  roadmapList: {
    gap: spacing.sm
  },
  roadmapRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  roadmapNumber: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800",
    width: 20
  },
  roadmapText: {
    flex: 1,
    gap: 2
  },
  roadmapTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  roadmapDetail: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18
  }
});
