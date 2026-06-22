export interface NativeAdvancedCameraInfo {
  id: string;
  lensFacing: "back" | "front" | "external" | "unknown";
  hardwareLevel: string;
  manualSensor: boolean;
  rawCapture: boolean;
  logicalMultiCamera: boolean;
  maxDigitalZoom: number;
  focalLengths: number[];
  opticalStabilization: boolean;
  videoStabilization: boolean;
  physicalCameraIds: string[];
}

export interface NativeAdvancedCameraAvailability {
  available: boolean;
  moduleName: "ForgeScanAdvancedCamera";
  engineVersion?: string;
  camera2Available?: boolean;
  cameraXCaptureImplemented?: boolean;
  camera2ManualCaptureImplemented?: boolean;
  arCoreSharedCameraImplemented?: boolean;
  recommendedNativePath?: string;
  hasBackCamera?: boolean;
  manualSensorSupported?: boolean;
  rawCaptureSupported?: boolean;
  logicalMultiCameraSupported?: boolean;
  physicalCameraIdsAvailable?: boolean;
  opticalStabilizationSupported?: boolean;
  videoStabilizationSupported?: boolean;
  maxDigitalZoom?: number;
  cameras: NativeAdvancedCameraInfo[];
  warnings: string[];
  errors: string[];
}
