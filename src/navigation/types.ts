import { RotationId } from "../core/manifest";

export type RootStackParamList = {
  Home: undefined;
  NewProject: undefined;
  CapturePlan: { projectId: string };
  CaptureRotation: { projectId: string; rotationId: RotationId };
  ProjectReview: { projectId: string };
  ReconstructionPlan: { projectId: string };
};
