import { RotationId } from "../core/manifest";

export type RootStackParamList = {
  Home: undefined;
  DeviceSupport: undefined;
  LoadProject: undefined;
  NewProject: undefined;
  CapturePlan: { projectId: string };
  CaptureRotation: { projectId: string; rotationId: RotationId };
  ProjectReview: { projectId: string; autoProcess?: boolean };
  ReconstructionPlan: { projectId: string };
  FullReconstructionRun: { projectId: string };
};
