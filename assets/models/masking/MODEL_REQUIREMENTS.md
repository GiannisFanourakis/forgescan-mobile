# Masking Model Requirements

ForgeScan Android V1 does not require a bundled object segmentation model.

The required Android masking runtime is:

```text
com.google.android.gms:play-services-mlkit-subject-segmentation:16.0.0-beta1
```

Runtime behavior:

- `ForgeScanNativeMasking.getAvailability()` checks whether ML Kit Subject Segmentation classes are present.
- `runOneFrameMaskTest()` runs ML Kit on a small native smoke-test image.
- `runMasking()` runs ML Kit per captured frame and writes PNG masks under `advanced/masks/`.
- Masks use threshold `foregroundConfidence >= 0.85`.
- If ML Kit is unavailable or inference fails, fallback-local masks can be written for pipeline continuity, but they are clearly labeled as fallback and are not real object segmentation.

Legacy bundled segmentation models are not part of the Android V1 masking path.
