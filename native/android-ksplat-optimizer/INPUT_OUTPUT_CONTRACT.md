# Android .ksplat Optimizer Input/Output Contract

Native module name:

```text
ForgeScanKsplatOptimizer
```

Required method:

```kotlin
runKsplatOptimizer(inputJson: String): Promise<String>
```

Recommended support methods:

```kotlin
getAvailability(): Promise<String>
cancelKsplatOptimizer(): Promise<Unit>
```

Input JSON:

```json
{
  "projectId": "forgescan_project",
  "projectName": "Sample",
  "orderedFrames": [
    {
      "rotationId": "upright",
      "frameIndex": 1,
      "frameUri": "file:///...",
      "order": 1
    }
  ],
  "objectMasks": [
    {
      "rotationId": "upright",
      "frameIndex": 1,
      "refinedMaskPath": "advanced/masks/refined/upright/frame_001.png",
      "refinedMaskUri": "file:///..."
    }
  ],
  "cameraData": {
    "cameraModel": "unknown-mobile-camera",
    "poseSource": "ordered-turntable-fallback",
    "motion": "controlled-object-turntable",
    "frames": []
  },
  "rotationMetadata": [],
  "outputFilename": "ForgeScan_Sample.ksplat",
  "outputDirectory": "photoreal",
  "outputPath": "photoreal/ForgeScan_Sample.ksplat",
  "optimizerSettings": {
    "target": "ksplat",
    "maxIterations": 7000,
    "imageDownscale": 1,
    "useMasks": true,
    "nativePreferred": true
  }
}
```

Output JSON:

```json
{
  "status": "generated",
  "ksplatUri": "file:///.../photoreal/ForgeScan_Sample.ksplat",
  "ksplatPath": "photoreal/ForgeScan_Sample.ksplat",
  "outputFilename": "ForgeScan_Sample.ksplat",
  "optimizerName": "native-gaussian-splat",
  "optimizerVersion": "0.1.0",
  "durationMs": 42000,
  "warnings": [],
  "errors": []
}
```

Do not return `generated` unless a real valid `.ksplat` file exists.
