# ForgeScan Android .ksplat Optimizer

This directory documents the native Android optimizer contract for ForgeScan V3.
The executable Android source now lives in:

```text
native/android/forgescan-engines/
```

Long-term production path:

```text
React Native UI -> ForgeScanKsplatOptimizer -> native Gaussian Splat optimizer -> photoreal/ForgeScan_{projectName}.ksplat
```

Expo Go can prepare capture data and show fallback status, but real `.ksplat` creation requires a development/native build with this module installed.

Current Android V1 is `trainable-3dgs-android-v1`. It initializes Gaussians from masked turntable frames, projects them into training views, computes masked photometric loss, updates Gaussian color/opacity/scale/small position offsets, and writes an experimental uncompressed SplatBuffer `.ksplat`.

`coarse-on-device-splat-v1` remains as fallback if trainable V1 fails. Neither path is production Gaussian Splat training.
