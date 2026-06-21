# ForgeScan Mobile

ForgeScan is a controlled object-capture prototype for future photorealistic 3D reconstruction. It uses structured 2-3 rotation capture rather than freeform scanning. The current version does not reconstruct 3D; it captures and validates the data needed for future AI/photogrammetry processing.

## Current Prototype Scope

- Create local scan projects with a stable manifest schema.
- Capture simulated ordered frame metadata for upright, tilted, and optional underside rotations.
- Persist projects and manifests in local device storage.
- Validate frame continuity, target frame counts, required rotation completion, and known image dimensions.
- Export a project manifest as local JSON.
- Export a 3D format target plan for GLB, USDZ, OBJ, STL, HTML, MP4, and GIF outputs as local JSON.
- Generate a structured reconstruction-plan placeholder.
- Track Android and iOS native reconstruction paths behind one shared app interface.

This prototype does not implement paid services, a backend, cloud upload, real photogrammetry, AI model inference, or background removal.

## Project Format

The app models each scan as:

```text
project/
  manifest.json
  rotations/
    upright/
      frame_001.jpg
      frame_002.jpg
    tilted/
      frame_001.jpg
      frame_002.jpg
    underside/
      frame_001.jpg
      frame_002.jpg
  thumbnails/
  exports/
```

Frame names are deterministic:

```text
frame_001.jpg
frame_002.jpg
frame_003.jpg
```

The TypeScript schema lives in `src/core/manifest.ts`.

## Future Pipeline

```text
Mobile capture
-> background removal / segmentation
-> frame quality scoring
-> pose estimation
-> multi-rotation alignment
-> photogrammetry or Gaussian Splatting reconstruction
-> AI cleanup / hole filling / texture repair
-> export GLB/USDZ/OBJ/STL
-> export HTML/MP4/GIF previews
```

## Android And iOS Versions

ForgeScan is developed as one shared React Native app with platform-specific native reconstruction engines:

```text
shared app
  -> capture workflow
  -> manifest and validation
  -> export contracts
  -> reconstruction interface

android native engine
  -> ARCore
  -> Kotlin/C++ NDK
  -> OpenCV
  -> MediaPipe or LiteRT
  -> GPU acceleration

ios native engine
  -> ARKit/RealityKit
  -> Swift native module
  -> Vision or Core ML
  -> Metal acceleration
  -> USDZ-first export
```

The shared TypeScript contracts live in `src/reconstruction/`. Platform implementation notes live in `native/android-reconstruction/` and `native/ios-reconstruction/`.

## Export Targets

ForgeScan tracks these intended export artifacts:

```text
exports/model.glb
exports/model.usdz
exports/model.obj
exports/model.stl
exports/viewer.html
exports/preview.mp4
exports/preview.gif
```

The current prototype exports the target plan and manifest contract for these formats. It does not generate the actual 3D model or preview files until a reconstruction pipeline is added.

## Run The App

Install dependencies, then start Expo:

```bash
npm install
npm run start
```

Optional checks:

```bash
npm run typecheck
```

## Test Phase

The current app is ready for the first manual test phase with simulated capture. Use `docs/TEST_PLAN.md` for Android and iOS smoke tests.

## Current Limitations

- Camera capture is represented by a placeholder screen and simulated frame metadata.
- Simulated capture writes frame metadata but does not create real image files yet.
- Manifest, 3D format plan, and reconstruction-plan exports write local JSON, not a ZIP/package yet.
- Reconstruction-plan generation is a contract for future processing only.
- Android and iOS native reconstruction modules are planned, not implemented yet.
- GLB, USDZ, OBJ, STL, HTML, MP4, and GIF files are planned outputs, not generated binaries yet.
- Background removal and frame quality scoring are represented in the schema but are not executed.
