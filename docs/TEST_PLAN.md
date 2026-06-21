# ForgeScan Mobile Test Plan

This plan verifies the current executable prototype in one session.

Normal users should only need this flow:

```text
Capture -> Photogrammetry / Splatting -> Preview -> Export
```

## Preflight

```bash
npm install
npm run typecheck
npm run start
```

There is no `npm test` script yet.

## Android Test

1. Start Expo with `npm run start` or `npx expo start --lan --port 8082 -c`.
2. Open the app in Expo Go or an Android emulator.
3. Create a project.
4. Choose a recommended preset or custom recommended frame count.
5. Choose 2 or 3 rotations.
6. Capture any number of frames per rotation.
7. For quick testing, capture at least 3-5 frames per required rotation.
8. For realistic quality testing, capture 72+ frames per rotation.
9. Confirm the app never blocks capture because the preset count was reached.
10. Confirm the frame count continues past the preset if you keep capturing.
11. Complete rotations manually.
12. Open Project Review.
13. Confirm actual frame counts and coverage tiers are shown.
14. Tap `Create 3D Result`.
15. Verify progress messages: Checking capture, Preparing object, Creating 3D preview, Preparing photoreal package, Creating viewer, Finished.
16. Verify it finishes or reports a clear warning.
17. Verify Preview shows Interactive Preview, Rough 3D Preview, Photoreal Package, and Captured Frames.
18. Tap `Export Results`.
19. Verify Export Complete appears.
20. Verify grouped outputs: Interactive Viewer, 3D Files, Photoreal Processing Package, Project Files.
21. Open `Advanced Details`.
22. Verify internal files, mask paths, JSON outputs, and warnings are visible.

## iOS Test

1. Start Expo with `npm run start`.
2. Open the app in Expo Go or an iOS simulator.
3. Create a project with 2 rotations only.
4. Leave underside unused.
5. Capture any number of frames for upright and tilted.
6. Confirm actual frame counts are shown.
7. Confirm optional underside warning is understandable and not blocking.
8. Confirm capture can continue beyond the recommended preset.
9. Complete required rotations manually.
10. Open Project Review.
11. Tap `Create 3D Result`.
12. Verify progress messages finish or show a clear warning.
13. Verify Preview shows viewer path, rough model path if generated, and photoreal package status.
14. Tap `Export Results`.
15. Verify grouped outputs and project folder path.
16. Open `Advanced Details`.
17. Confirm warnings are based on coverage and missing optional underside, not hard limits.

## Expected Files

Required package files:

```text
ForgeScan/projects/{projectId}/manifest.json
ForgeScan/projects/{projectId}/exports/export-targets.json
ForgeScan/projects/{projectId}/exports/segmentation-plan.json
ForgeScan/projects/{projectId}/exports/reconstruction-plan.json
ForgeScan/projects/{projectId}/exports/reconstruction-job.json
ForgeScan/projects/{projectId}/exports/splatting-job.json
ForgeScan/projects/{projectId}/exports/viewer.html
ForgeScan/projects/{projectId}/exports/README_EXPORTS.txt
```

At least one reconstruction artifact must exist:

```text
ForgeScan/projects/{projectId}/exports/model.obj
ForgeScan/projects/{projectId}/reconstruction/rough-model.obj
ForgeScan/projects/{projectId}/reconstruction/point-cloud.ply
```

Segmentation must generate fallback PNG mask artifacts:

```text
ForgeScan/projects/{projectId}/masks/raw/{rotation}/frame_001.png
ForgeScan/projects/{projectId}/masks/refined/{rotation}/frame_001.png
ForgeScan/projects/{projectId}/masks/segmentation-result.json
```

The full reconstruction test screen may also generate:

```text
ForgeScan/projects/{projectId}/exports/model.glb
ForgeScan/projects/{projectId}/exports/model.usdz
ForgeScan/projects/{projectId}/exports/model.stl
ForgeScan/projects/{projectId}/exports/preview.mp4
ForgeScan/projects/{projectId}/exports/preview.gif
ForgeScan/projects/{projectId}/exports/full-run-report.json
```

## Expected Warnings

- Fallback segmentation currently runs; AI model integration is the next replacement step.
- Rough reconstruction/proxy export currently runs; production photogrammetry is the next replacement step.
- Gaussian Splatting job package is exported for future optimizer integration.
- Optional underside missing is a warning only.
- Fewer than 24 frames is a warning only.
- More than the recommended frame count is allowed and must not block processing.

## Acceptance Criteria

- Normal user flow is Capture, Photogrammetry / Splatting, Preview, Export.
- No normal user is forced to run object separation, reconstruction, export JSON, or package writer steps manually.
- Advanced Details is collapsed by default and keeps technical/debug visibility.
- Typecheck passes.
