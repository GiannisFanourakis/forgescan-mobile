# ForgeScan Android .ksplat Optimizer

This directory documents the native Android optimizer contract for ForgeScan V3.

Production path:

```text
React Native UI -> ForgeScanKsplatOptimizer -> native Gaussian Splat optimizer -> photoreal/ForgeScan_{projectName}.ksplat
```

The native optimizer is the production path for real `.ksplat` generation. Expo Go can prepare capture data and show fallback status, but real optimization requires a development/native build with this module implemented.

This is a contract stub until the native optimizer internals are implemented.
