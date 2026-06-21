# ForgeScan Engine Upgrade Path

This document describes what remains after the Android V1 engine work. It does not claim production-quality engines are already implemented.

## Replace BiRefNet Android V1 With Production Mobile Masking

Implemented now:

- Android ONNX Runtime model loader.
- BiRefNet ONNX asset path.
- Image decode.
- ImageNet-normalized RGB preprocessing.
- ONNX Runtime inference call.
- Output mask postprocessing.
- Raw/refined PNG mask writing.
- Dedicated BiRefNet load and one-frame smoke diagnostics.

Expected model location:

```text
assets/models/masking/birefnet.onnx
```

Setup/check command:

```bash
npm run model:birefnet:install
npm run model:birefnet:check
```

Current repository state:

- BiRefNet ONNX model file is installed for Android dev builds.
- Temporary DeepLab fallback is bundled at `assets/models/masking/mobile-segmentation.tflite`.

Requirements before claiming BiRefNet works:

- `assets/models/masking/birefnet.onnx` exists.
- Model license allows mobile app usage.
- `Test BiRefNet Model Load` passes.
- `Run One-Frame BiRefNet Mask Test` passes.
- PNG mask exists and size is greater than 0.
- Active masking status reports `birefnet-complete`.

## Replace Android Trainable V1 With Production Gaussian Splat Training

Implemented now:

- Android CPU trainable V1 optimizer.
- Turntable angle estimation from ordered frames.
- Masked frame sampling.
- Gaussian initialization from masked object pixels.
- Projection into training views.
- Masked photometric loss.
- Updates to Gaussian color, opacity, scale, and small position offsets.
- Experimental `.ksplat` writer.
- Coarse V1 fallback.

Production training must add:

- Camera calibration or robust pose estimation.
- Multi-view feature matching or reliable turntable pose recovery.
- Geometry-aware Gaussian initialization.
- Full optimization over position, scale, rotation, opacity, and color.
- Stronger loss functions and visibility handling.
- Quality metrics for reprojection, coverage, sharpness, and consistency.
- Verified `.ksplat` compatibility with target viewers.
- Native diagnostics must report a concrete optimizer blocker if any runtime step is unavailable.

Production status may only be claimed when:

- The production optimization loop runs on device.
- Output quality tier is `production-3dgs`.
- `.ksplat` writer status is `valid-ksplat`.
- Validation confirms extension, existence, and size greater than 0.
- Real scan output is verified in the target viewer.

## Add Preview MP4/GIF Rendering

Current status:

```text
Preview video/GIF requires future native preview rendering.
```

Expected native rendering path:

- Load generated `.ksplat`.
- Render orbit preview on-device.
- Encode `preview.mp4`.
- Encode `preview.gif` or derive it from MP4.

Input source:

- `photoreal/ForgeScan_{projectName}.ksplat`
- Project camera/rotation metadata.
- Optional thumbnail/background settings.

Output requirements:

- Write `preview/preview.mp4`.
- Write `preview/preview.gif`.
- Validate each file exists and size is greater than 0.
- Mark preview exports as Generated only after validation passes.
