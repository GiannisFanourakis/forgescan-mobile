# ForgeScan Android Masking Module

This directory documents the native Android masking contract for ForgeScan V3.
The executable Android source lives in:

```text
native/android/forgescan-engines/
```

Android path:

```text
React Native UI -> ForgeScanNativeMasking -> BiRefNet ONNX Runtime -> advanced/masks/
```

Expo Go does not include this module. In Expo Go, JavaScript reports:

```text
Native AI masking requires a development/native build.
```

The Android implementation uses ONNX Runtime for BiRefNet and TensorFlow Lite for the temporary fallback model. Do not run the model in JavaScript.

Current Android V1 prefers `assets/models/masking/birefnet.onnx`. If it loads and inference succeeds, the app reports BiRefNet as active. If BiRefNet is missing or fails, the module can use the bundled `assets/models/masking/mobile-segmentation.tflite` temporary DeepLab fallback.

If BiRefNet is missing, the app reports `BiRefNet model is missing. Add the model at assets/models/masking/birefnet.onnx.` If a model cannot load, it reports `On-phone masking model failed to load.` If inference fails, it reports `On-phone masking inference failed.`
