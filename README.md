# ForgeScan Mobile

ForgeScan is a controlled object-capture prototype for future photorealistic 3D reconstruction. It uses structured 2-3 rotation capture rather than freeform scanning. The current version does not reconstruct 3D; it captures and validates the data needed for future AI/photogrammetry processing.

## Current Prototype Scope

- Create local scan projects with a stable manifest schema.
- Capture simulated ordered frame metadata for upright, tilted, and optional underside rotations.
- Validate frame continuity, target frame counts, required rotation completion, and known image dimensions.
- Export a project manifest as JSON.
- Export a 3D format target plan for GLB, USDZ, OBJ, STL, HTML, MP4, and GIF outputs.
- Generate a structured reconstruction-plan placeholder.

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

## Current Limitations

- Camera capture is represented by a placeholder screen and simulated frame metadata.
- Local project persistence is not implemented; projects live in memory for the running session.
- Manifest and 3D format plan exports currently display JSON in-app instead of writing a ZIP/package.
- Reconstruction-plan generation is a contract for future processing only.
- GLB, USDZ, OBJ, STL, HTML, MP4, and GIF files are planned outputs, not generated binaries yet.
- Background removal and frame quality scoring are represented in the schema but are not executed.
