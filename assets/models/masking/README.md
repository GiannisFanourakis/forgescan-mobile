# ForgeScan Masking Models

Android dev builds use ONNX Runtime for BiRefNet and TensorFlow Lite for the temporary fallback model.

Primary BiRefNet path:

```text
assets/models/masking/birefnet.onnx
```

Fallback temporary model:

```text
assets/models/masking/mobile-segmentation.tflite
```

During `npx expo prebuild`, `plugins/withForgeScanNativeEngines.js` copies non-Markdown files from this folder into:

```text
android/app/src/main/assets/models/masking/
```

Current Android dev builds bundle:

```text
assets/models/masking/birefnet.onnx
assets/models/masking/mobile-segmentation.tflite
```

`birefnet.onnx` is the official smaller BiRefNet ONNX release asset:

```text
BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx
```

Install or check the model with:

```bash
npm run model:birefnet:install
npm run model:birefnet:check
```

If no model is present, Android reports:

```text
BiRefNet model is missing. Add the model at assets/models/masking/birefnet.onnx.
```

If the model exists but cannot load, Android reports:

```text
On-phone masking model failed to load.
```

If inference fails for a frame, Android reports:

```text
On-phone masking inference failed.
```
