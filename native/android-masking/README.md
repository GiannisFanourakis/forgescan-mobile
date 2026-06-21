# ForgeScan Android Masking Module

This directory documents the native Android masking contract for ForgeScan V3.

Production path:

```text
React Native UI -> ForgeScanNativeMasking -> native object-background model -> advanced/masks/
```

Expo Go does not include this module. In Expo Go, JavaScript reports:

```text
Native AI masking requires a development/native build.
```

The intended native implementation can use ONNX Runtime Mobile, LiteRT/TFLite, MediaPipe-style inference, GPU/NPU acceleration, and a BiRefNet-style object/background separation model. Do not bundle a large model in JavaScript.

This is a contract stub until the native engine internals are implemented.
