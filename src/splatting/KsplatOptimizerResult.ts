import {
  KsplatEngineStatus,
  KsplatOptimizerStatus,
  KsplatQualityTier,
  KsplatWriterStatus
} from "./KsplatTypes";

export interface KsplatOptimizerResult {
  status: KsplatOptimizerStatus;
  ksplatUri?: string;
  ksplatPath?: string;
  outputFilename: string;
  optimizerName?: string;
  optimizerVersion?: string;
  qualityTier?: KsplatQualityTier;
  ksplatEngineStatus?: KsplatEngineStatus;
  ksplatWriterStatus?: KsplatWriterStatus;
  optimizerRuntimeStatus?: string;
  optimizerBlocker?: string;
  production3dgs?: boolean;
  production3dgsStatus?: KsplatEngineStatus;
  iterationCount?: number;
  gaussianCount?: number;
  finalLoss?: number;
  durationMs?: number;
  warnings: string[];
  errors: string[];
}
