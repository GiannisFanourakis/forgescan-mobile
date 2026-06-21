import { KsplatOptimizerStatus } from "./KsplatTypes";

export interface KsplatOptimizerResult {
  status: KsplatOptimizerStatus;
  ksplatUri?: string;
  ksplatPath?: string;
  outputFilename: string;
  optimizerName?: string;
  optimizerVersion?: string;
  durationMs?: number;
  warnings: string[];
  errors: string[];
}
