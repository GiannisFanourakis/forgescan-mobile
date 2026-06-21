# ForgeScan Mobile

ForgeScan Mobile is an Expo/React Native prototype for controlled object splatting with turntable-style capture.

```text
Capture -> Splatting -> Preview -> Export
```

The product goal is simple: capture ordered object rotations, create a photoreal splat result, and export one normal 3D asset:

```text
ForgeScan_{projectName}.ksplat
```

Preview media can also be exported when available:

```text
preview.mp4
preview.gif
```

Everything else is internal implementation detail, cache, source data, debug output, or Advanced Details.

## What Works Now

- Create local scan projects.
- Choose 2 rotations or 3 rotations.
- Choose a recommended frame preset or custom recommended count.
- Capture real camera photos, timed bursts, and muted video clips.
- Capture unlimited frames per rotation.
- Retake/delete the last photo or video.
- Complete each rotation manually.
- Show actual frame counts and coverage quality.
- Run one user-facing splatting action: `Create Photoreal Scan`.
- Prepare object masks, alignment data, source frame order, and splatting inputs internally.
- Export a native/external optimizer-ready splatting package in Advanced Details.
- Show `.ksplat` honestly as requiring native/external splat optimization when not generated on-device.
- Keep mesh, point-cloud, JSON, masks, source data, logs, and fallback files out of the normal export UI.

## Product Flow

### Capture

Create a project, choose 2 or 3 rotations, and capture unlimited images. More frames improve coverage, but presets are guidance only.

### Splatting

Tap `Create Photoreal Scan`. The app validates capture, prepares object data, prepares alignment data, creates splatting input data, and prepares preview fallback files.

### Preview

The Preview step shows the best available preview status. If a real `.ksplat` is not generated in this Expo build, the UI says so and uses a fallback preview.

### Export

Tap `Export .ksplat`. The normal export UI only shows:

- `ForgeScan_{projectName}.ksplat`
- `preview.mp4`
- `preview.gif`

OBJ, GLB, STL, USDZ, PLY, JSON, masks, source frames, project folders, viewer HTML, and logs are internal or Advanced Details only. They are not final user exports.

## Run

```bash
npm install
npm run start
```

Checks:

```bash
npm run typecheck
```

There is no `npm test` script in this prototype yet.

## Unlimited Capture

`targetFrameCount` still exists in the manifest for backward compatibility, but the UI treats it as a recommended count. It is not a hard limit.

Coverage tiers:

```text
0 frames       empty
1-23 frames    low coverage
24-71 frames   basic coverage
72-119 frames  standard coverage
120-179 frames high coverage
180+ frames    very high coverage
```

Validation blocks splatting only when required rotations are incomplete or complete with zero frames. Under 24 frames is a warning. Over-capture is allowed.

## Generated Project Structure

Normal export targets:

```text
ForgeScan/projects/{projectId}/
  photoreal/
    ForgeScan_{projectName}.ksplat   # expected final asset; only present after native/external optimization
  preview/
    preview.mp4                      # unavailable in current Expo build
    preview.gif                      # unavailable in current Expo build
```

Current Expo build internal files:

```text
ForgeScan/projects/{projectId}/
  manifest.json
  README.txt
  open_viewer.html
  rotations/
  masks/
  reconstruction/
  photoreal/
    cameras.json
    splatting-job.json
  source/
    manifest.json
    frames/frames.json
    masks/masks.json
    reconstruction-report.json
  fallback/
    model.obj
    point-cloud.ply
  exports/
    export-targets.json
    segmentation-plan.json
    reconstruction-plan.json
    reconstruction-job.json
    splatting-job.json
```

## Splatting Status

`.ksplat` is the only normal 3D export.

This Expo build does not generate a valid `.ksplat` on-device. It prepares the internal splatting package and marks the photoreal scan as:

```text
Requires native/external splat optimizer
```

Do not treat OBJ, GLB, STL, USDZ, PLY, or point-cloud files as final user exports. Any mesh or point-cloud files are debug/fallback/internal artifacts.

## Manual Test

1. Open the app.
2. Create a project.
3. Pick a recommended frame preset or custom count.
4. Pick 2 or 3 rotations.
5. Capture real photos, timed burst photos, or video.
6. Keep capturing past the preset if desired.
7. Complete each required rotation manually.
8. Open Project Review.
9. Tap `Create Photoreal Scan`.
10. Confirm Preview shows photoreal scan status and fallback preview status.
11. Tap `Export .ksplat`.
12. Confirm the normal export UI only shows `ForgeScan_{projectName}.ksplat`, `preview.mp4`, and `preview.gif`.
13. Open `Advanced Details`.
14. Confirm internal splatting package, masks, source frames, fallback files, and logs are only shown there.

## Known Limitations

- A real `.ksplat` is not generated in Expo Go yet.
- `.ksplat` output currently requires native/external splat optimization.
- `preview.mp4` and `preview.gif` are not generated in the normal Expo flow yet.
- Object masks are fallback artifacts, not production AI matting.
- Mesh and point-cloud files are internal fallback/debug artifacts, not normal exports.
- Native Android/iOS engines are still future work for on-device splat optimization and preview rendering.
