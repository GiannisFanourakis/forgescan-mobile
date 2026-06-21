# ForgeScan iOS Masking Module

This directory documents the native iOS masking contract for ForgeScan V3.

Production path:

```text
React Native UI -> ForgeScanNativeMasking -> Core ML/Vision object-background model -> advanced/masks/
```

Expo Go does not include this module. In Expo Go, JavaScript reports:

```text
Native AI masking requires a development/native build.
```

The intended native implementation can use Core ML, Vision/Core Image preprocessing, and Metal acceleration. A BiRefNet-style object/background separation model should be packaged natively, not in JavaScript.

This is a contract stub until the native engine internals are implemented.
