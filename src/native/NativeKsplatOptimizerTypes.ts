import { KsplatOptimizerInput } from "../splatting/KsplatOptimizerInput";
import { KsplatOptimizerResult } from "../splatting/KsplatOptimizerResult";
import {
  KsplatEngineStatus,
  KsplatQualityTier,
  KsplatWriterStatus
} from "../splatting/KsplatTypes";

export type NativeKsplatOptimizerAvailabilityMode =
  | "native-on-device"
  | "requires-native-build";

export interface NativeKsplatOptimizerAvailability {
  available: boolean;
  mode: NativeKsplatOptimizerAvailabilityMode;
  moduleName: "ForgeScanKsplatOptimizer";
  reason?: string;
  optimizerName?: string;
  optimizerVersion?: string;
  writerAvailable?: boolean;
  canCreateOutputDirectory?: boolean;
  qualityTier?: KsplatQualityTier;
  ksplatEngineStatus?: KsplatEngineStatus;
  ksplatWriterStatus?: KsplatWriterStatus;
  optimizerRuntimeStatus?: string;
  optimizerBlocker?: string;
  production3dgs?: boolean;
  production3dgsStatus?: KsplatEngineStatus;
  trainableLoopAvailable?: boolean;
  coarseFallbackAvailable?: boolean;
}

export interface NativeKsplatOptimizerProgress {
  status: "preparing" | "processing";
  progress: number;
  message?: string;
}

export type NativeKsplatOptimizerInput = KsplatOptimizerInput;
export type NativeKsplatOptimizerOutput = KsplatOptimizerResult;

export interface NativeKsplatSmokeTestResult {
  status: "pass" | "fail" | "requires-native-build";
  ksplatUri?: string;
  ksplatBytes?: number;
  writerAvailable?: boolean;
  optimizerName?: string;
  qualityTier?: KsplatQualityTier;
  ksplatEngineStatus?: KsplatEngineStatus;
  ksplatWriterStatus?: KsplatWriterStatus;
  optimizerRuntimeStatus?: string;
  optimizerBlocker?: string;
  production3dgs?: boolean;
  production3dgsStatus?: KsplatEngineStatus;
  trainableLoopAvailable?: boolean;
  coarseFallbackAvailable?: boolean;
  iterationCount?: number;
  gaussianCount?: number;
  finalLoss?: number;
  warnings: string[];
  errors: string[];
}
