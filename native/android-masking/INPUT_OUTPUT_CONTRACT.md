# Android Masking Input/Output Contract

Native module name:

```text
ForgeScanNativeMasking
```

Expected methods:

```kotlin
getAvailability(): Promise<String>
runMasking(inputJson: String): Promise<String>
cancelMasking(): Promise<Unit>
```

Input JSON:

```json
{
  "projectId": "forgescan_project",
  "frames": [
    {
      "rotationId": "upright",
      "frameIndex": 1,
      "frameUri": "file:///..."
    }
  ],
  "rotationMetadata": [
    {
      "rotationId": "upright",
      "label": "Upright 360",
      "required": true,
      "frameCount": 72,
      "status": "complete"
    }
  ],
  "outputDirectory": "advanced/masks",
  "modelHint": "mlkit-subject-segmentation",
  "desiredMaskFormat": "png",
  "refinementEnabled": true
}
```

Output JSON:

```json
{
  "status": "complete",
  "engineName": "native-ai",
  "engineVersion": "0.1.0",
  "modelName": "mlkit-subject-segmentation",
  "maskArtifacts": [
    {
      "rotationId": "upright",
      "frameIndex": 1,
      "sourceFrameUri": "file:///...",
      "rawMaskUri": "file:///.../advanced/masks/raw/upright/frame_001.png",
      "refinedMaskUri": "file:///.../advanced/masks/refined/upright/frame_001.png",
      "rawMaskPath": "advanced/masks/raw/upright/frame_001.png",
      "refinedMaskPath": "advanced/masks/refined/upright/frame_001.png",
      "status": "complete",
      "warnings": [],
      "errors": []
    }
  ],
  "warnings": [],
  "errors": []
}
```

If PNG generation is blocked, native code may emit documented `.mask.json` files under the same raw/refined folder layout.
