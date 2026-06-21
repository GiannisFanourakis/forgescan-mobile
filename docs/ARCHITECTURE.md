# ForgeScan Mobile Architecture

## Layers

- `src/screens`: phone UI for home, capture, review, reconstruction plan, and full reconstruction test.
- `src/core`: manifest, validation, coverage tiers, export targets, segmentation plans, reconstruction plans, and packaging contracts.
- `src/storage`: Expo FileSystem project storage and full package writing.
- `src/segmentation`: fallback-local background removal and mask artifact writing.
- `src/reconstruction`: AI model registry, platform engine metadata, rough reconstruction, full-run test runner, and Gaussian Splatting job packages.

## Manifest

Projects are local manifests with app metadata, project metadata, capture rotations, quality state, processing settings, and export settings. `targetFrameCount` remains for compatibility but is treated as recommended frame guidance.

## Unlimited Capture

Capture is unlimited. Users complete rotations manually. Coverage tiers are derived from actual frame counts:

```text
empty, low, basic, standard, high, very-high
```

Validation blocks only incomplete required rotations and required rotations with zero frames. Low coverage is a warning.

## Rotations And Frames

Each project has:

```text
upright
tilted
underside
```

Frames are saved as deterministic files:

```text
rotations/{rotation}/frame_001.jpg
rotations/{rotation}/frame_002.jpg
```

## Segmentation Artifacts

The segmentation plan expects one raw and one refined mask per captured frame:

```text
masks/raw/{rotation}/frame_001.png
masks/refined/{rotation}/frame_001.png
```

`LocalSegmentationEngine` currently writes fallback PNG mask artifacts and JSON metadata. It is replaceable by a future AI model.

## Package Writer

`src/storage/projectPackageWriter.ts` creates the project folders, writes plans, runs fallback segmentation, runs rough reconstruction, exports splatting jobs, writes a viewer, and writes `README_EXPORTS.txt`.

## Reconstruction Attempt

`LocalReconstructionEngine` writes executable rough outputs:

```text
reconstruction/reconstruction-input.json
reconstruction/camera-frames.json
reconstruction/masks.json
reconstruction/alignment-input.json
reconstruction/rough-model.obj
reconstruction/point-cloud.ply
exports/reconstruction-job.json
exports/model.obj
```

This is a rough proxy, not production photogrammetry.

## Gaussian Splatting Package

`src/reconstruction/splatting/splattingPackage.ts` writes:

```text
reconstruction/splatting-job.json
reconstruction/splatting-frames.json
exports/splatting-job.json
```

It packages frames, mask paths, frame order, turntable camera assumptions, optimizer settings, and expected outputs.

## HTML Viewer Export

The package writer exports `exports/viewer.html`, a frame-based turntable viewer that cycles captured frames.

## Future Native Engines

Android should move heavy stages into ARCore, LiteRT/TFLite, OpenCV, Kotlin/C++ NDK, and GPU acceleration. iOS should move heavy stages into ARKit, Vision/Core ML, RealityKit/Object Capture style workflows, Swift/C++, and Metal.

## What Currently Executes

- Real camera capture.
- Unlimited ordered frame storage.
- Fallback segmentation file generation.
- Frame coverage and validation.
- Rough reconstruction/proxy artifact generation.
- Gaussian Splatting job package creation.
- Local HTML viewer export.
- Full project package writing.

## Weak Areas

- Fallback masks are not true semantic segmentation.
- Rough OBJ/PLY outputs are not high-quality 3D reconstruction.
- Splatting optimization is packaged but not run on-device.
- GLB/USDZ/MP4/GIF generation is limited to lightweight full-run test artifacts.
