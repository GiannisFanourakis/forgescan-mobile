# Masking Model Requirements

Preferred production model:

```text
assets/models/masking/birefnet.onnx
```

Temporary Android fallback:

```text
assets/models/masking/mobile-segmentation.tflite
```

Requirements:

- Must run fully on-device on Android.
- Must accept a single RGB image or documented preprocessed tensor.
- Must output an object/background mask that can be written as PNG.
- Must have a license that allows bundling in a mobile app.
- Should be small enough for a development build test before production packaging.

Current state:

- BiRefNet ONNX Runtime loader, preprocessing, inference call, postprocessing, and PNG mask writing are implemented.
- Real BiRefNet ONNX is installed in this repository for Android dev builds.
- `mobile-segmentation.tflite` is bundled as the temporary Android segmentation model.
- Android uses ONNX Runtime inference when `birefnet.onnx` loads; `birefnet.tflite` remains an optional converted alternate path; otherwise it uses the temporary DeepLab fallback if present.
- Fallback-local masking is used only with a recorded warning when the model is missing, fails to load, or inference fails.
- If BiRefNet is missing, diagnostics report `BiRefNet model is missing. Add the model at assets/models/masking/birefnet.onnx.`
- If a model file exists but cannot load, diagnostics report `On-phone masking model failed to load.`
- If inference fails, diagnostics report `On-phone masking inference failed.`

BiRefNet ONNX expectations:

- Input tensor must be RGB image data in NCHW or NHWC layout.
- Float input uses ImageNet normalization.
- Output tensor may be a single-channel foreground probability mask or a multi-class mask where class `0` is background.
- Output is upsampled to the original frame size and written as raw and refined PNG files.
