# ForgeScan Mobile

ForgeScan Mobile is an Expo/React Native prototype for structured object capture and local reconstruction package generation. The user-facing flow is:

```text
Capture -> Photogrammetry / Splatting -> Preview -> Export
```

It captures an object through upright, tilted, and optional underside rotations, stores ordered frames locally, creates a rough 3D result, prepares a photoreal package for future Gaussian Splatting optimization, previews results, and exports grouped project files.

This is an executable prototype, not production-quality photogrammetry. The app favors a rough working pipeline over perfect 3D quality.

## What Works Now

- Create local scan projects.
- Choose 2 rotations or 3 rotations.
- Choose a recommended frame preset or custom recommended count.
- Capture real camera photos, timed bursts, and muted video clips.
- Capture unlimited frames per rotation.
- Retake/delete the last photo or video.
- Complete each rotation manually.
- Persist ordered frames as `frame_001.jpg`, `frame_002.jpg`, and onward.
- Create a 3D result with one user-facing action.
- Run fallback object preparation / object separation internally.
- Generate mask files under `masks/raw/` and `masks/refined/`.
- Run rough local reconstruction fallback.
- Generate rough OBJ and PLY artifacts.
- Prepare a photoreal package for future Gaussian Splatting optimization.
- Export a local HTML frame viewer.
- Export grouped project files with paths shown in the app.
- Keep technical actions behind collapsed Advanced Details.

## Product Flow

### Capture

Create a project, choose 2 or 3 rotations, and capture unlimited images. More frames improve coverage, but presets are guidance only. The app shows actual frame counts and coverage tiers.

### Photogrammetry / Splatting

Tap `Create 3D Result`. The app internally prepares object separation, rough 3D preview files, a photogrammetry/reconstruction package, a photoreal package, and viewer files. Current builds may use fallback/basic processing.

### Preview

The Preview step shows grouped results: Interactive Preview, Rough 3D Preview, Photoreal Package, and Captured Frames. If the 3D output is rough, the captured frames and generated model paths remain visible.

### Export

Tap `Export Results`. The app exports grouped results: Interactive Viewer, 3D Files, Photoreal Processing Package, and Project Files.

Advanced Details are collapsed by default and expose internal files/actions for debugging.

## Run

```bash
npm install
npm run start
```

Use Expo Go on Android or iOS, or an emulator. For LAN testing:

```bash
npx expo start --lan --port 8082 -c
```

Checks:

```bash
npm run typecheck
```

There is no `npm test` script in this prototype yet.

## Unlimited Capture

`targetFrameCount` still exists in the manifest for backward compatibility, but the UI treats it as `recommendedFrameCount`. It is not a hard limit.

Coverage tiers:

```text
0 frames      empty
1-23 frames   low coverage
24-71 frames  basic coverage
72-119 frames standard coverage
120-179 frames high coverage
180+ frames   very high coverage
```

Recommended presets:

```text
Quick test        24
Standard          72
High quality      120
Very high quality 180+
Maximum detail    keep capturing until manually complete
```

Validation only blocks reconstruction when required rotations are incomplete or complete with zero frames. Under 24 frames is a warning. Over-capture is allowed.

## Generated Project Structure

```text
ForgeScan/projects/{projectId}/
  manifest.json
  rotations/
    upright/frame_001.jpg
    tilted/frame_001.jpg
    underside/frame_001.jpg
  masks/
    raw/{rotation}/frame_001.png
    refined/{rotation}/frame_001.png
    segmentation-result.json
  reconstruction/
    reconstruction-input.json
    camera-frames.json
    masks.json
    alignment-input.json
    rough-model.obj
    point-cloud.ply
    splatting-job.json
    splatting-frames.json
  exports/
    export-targets.json
    segmentation-plan.json
    reconstruction-plan.json
    reconstruction-job.json
    splatting-job.json
    model.obj
    viewer.html
    README_EXPORTS.txt
```

Advanced Details and the full reconstruction test route can also generate additional test outputs:

```text
exports/model.glb
exports/model.usdz
exports/model.stl
exports/preview.mp4
exports/preview.gif
exports/full-run-report.json
```

## Object Preparation

Fallback segmentation currently runs; AI model integration is the next replacement step.

The current segmentation engine is `fallback-local`. It does not run a neural AI model in Expo Go. It writes deterministic PNG mask artifacts and JSON metadata for every captured frame so the app can test the pipeline end to end.

The adapter lives in:

```text
src/segmentation/
```

A stronger native or on-device AI segmenter can replace `LocalSegmentationEngine` later.

## Photogrammetry / Splatting

Rough reconstruction/proxy export currently runs; production photogrammetry is the next replacement step.

The current reconstruction engine is `local-rough-proxy`. It creates:

- `reconstruction/reconstruction-input.json`
- `reconstruction/camera-frames.json`
- `reconstruction/masks.json`
- `reconstruction/alignment-input.json`
- `reconstruction/rough-model.obj`
- `reconstruction/point-cloud.ply`
- `exports/reconstruction-job.json`
- `exports/model.obj`

This is not true photogrammetry. It is a rough proxy output that proves storage, inputs, UI flow, and export paths.

## Photoreal Package

Gaussian Splatting job package is exported for future optimizer integration.

On-device splat optimization is not implemented in Expo Go. The app creates a complete job package with frames, masks, frame order, camera assumptions, optimizer settings, and expected output paths:

```text
reconstruction/splatting-job.json
exports/splatting-job.json
```

## Manual Test

1. Open the app.
2. Create a project.
3. Pick a recommended frame preset or custom count.
4. Pick 2 or 3 rotations.
5. Capture real photos, timed burst photos, or video.
6. Keep capturing past the preset if desired.
7. Complete each required rotation manually.
8. Open Project Review.
9. Tap `Create 3D Result`.
10. Confirm Preview shows Interactive Preview, Rough 3D Preview, Photoreal Package, and Captured Frames.
11. Tap `Export Results`.
12. Confirm Export Complete shows grouped outputs.
13. Open `Advanced Details` only if you need internal file paths or debug actions.

## Known Limitations

- Segmentation is a fallback mask generator, not production AI matting.
- Reconstruction is a rough proxy, not production photogrammetry.
- Gaussian Splatting creates a job package but does not optimize splats on-device.
- GLB/USDZ/STL/MP4/GIF are generated by the full-run test as lightweight test artifacts.
- Native Android/iOS engines are still future work for ARCore/ARKit, TFLite/LiteRT, OpenCV, GPU reconstruction, and real preview rendering.
