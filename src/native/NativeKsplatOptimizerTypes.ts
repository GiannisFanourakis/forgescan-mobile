import { KsplatOptimizerInput } from "../splatting/KsplatOptimizerInput";
import { KsplatOptimizerResult } from "../splatting/KsplatOptimizerResult";

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
}

export interface NativeKsplatOptimizerProgress {
  status: "preparing" | "processing";
  progress: number;
  message?: string;
}

export type NativeKsplatOptimizerInput = KsplatOptimizerInput;
export type NativeKsplatOptimizerOutput = KsplatOptimizerResult;
