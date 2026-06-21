import { ExportFormat, ForgeScanProjectManifest } from "../core/manifest";

export type MobilePlatform = "android" | "ios";
export type CapabilityStatus =
  | "available"
  | "requires-native-build"
  | "planned"
  | "unsupported";
export type EngineImplementationStatus =
  | "shared-capture-ready"
  | "native-track"
  | "native-prototype"
  | "production-ready";

export interface ReconstructionCapability {
  id: string;
  label: string;
  status: CapabilityStatus;
  detail: string;
}

export interface PlatformRoadmapItem {
  order: number;
  title: string;
  detail: string;
}

export interface PlatformReconstructionJobPlan {
  platform: MobilePlatform;
  projectId: string;
  projectTitle: string;
  status: "plan-only";
  nativeModuleName: string;
  requiredInputs: string[];
  targetFormats: ExportFormat[];
  stages: string[];
}

export interface PlatformReconstructionEngine {
  platform: MobilePlatform;
  displayName: string;
  nativeModuleName: string;
  implementationStatus: EngineImplementationStatus;
  summary: string;
  capabilities: ReconstructionCapability[];
  roadmap: PlatformRoadmapItem[];
  createJobPlan: (
    manifest: ForgeScanProjectManifest
  ) => PlatformReconstructionJobPlan;
}
