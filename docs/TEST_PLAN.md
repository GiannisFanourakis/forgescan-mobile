# ForgeScan Mobile Test Plan

This plan verifies the splatting-first prototype in one session.

Normal user flow:

```text
Capture -> Splatting -> Preview -> Export
```

## Preflight

```bash
npm install
npm run typecheck
npm run start
```

There is no `npm test` script yet.

## Main Test Flow

1. Open the app in Expo Go or an emulator.
2. Create a project.
3. Choose a recommended preset or custom recommended frame count.
4. Choose 2 or 3 rotations.
5. Capture any number of frames per rotation.
6. Confirm the app never blocks capture because the preset count was reached.
7. Complete required rotations manually.
8. Open Project Review.
9. Confirm actual frame counts and coverage tiers are shown.
10. Tap `Create Photoreal Scan`.
11. Verify progress messages: Checking capture, Preparing object, Preparing alignment, Creating splat data, Preparing preview fallback, Finished.
12. Verify it finishes or reports a clear warning.
13. Verify Preview shows photoreal scan status and fallback preview status.
14. Tap `Export .ksplat`.
15. Confirm the normal export UI only shows:
    - `ForgeScan_{projectName}.ksplat`
    - `preview.mp4`
    - `preview.gif`
16. Confirm `.ksplat` status is either `Generated`, `Requires native/external splat optimizer`, or `Failed`.
17. Confirm current Expo build shows `Requires native/external splat optimizer`.
18. Confirm `preview.mp4` and `preview.gif` show unavailable unless a native preview renderer has generated them.
19. Expand `Advanced Details`.
20. Confirm internal artifacts are only shown there.

## Advanced Details Checks

Advanced Details may list:

```text
photoreal/splatting-job.json
photoreal/cameras.json
source frames
masks
alignment data
fallback/model.obj
fallback/point-cloud.ply
open_viewer.html
manifest.json
logs
project folder path
```

Advanced Details must be collapsed by default.

## Expected Internal Files

Required internal files for the current Expo build:

```text
ForgeScan/projects/{projectId}/manifest.json
ForgeScan/projects/{projectId}/README.txt
ForgeScan/projects/{projectId}/open_viewer.html
ForgeScan/projects/{projectId}/photoreal/cameras.json
ForgeScan/projects/{projectId}/photoreal/splatting-job.json
ForgeScan/projects/{projectId}/source/manifest.json
ForgeScan/projects/{projectId}/source/frames/frames.json
ForgeScan/projects/{projectId}/source/masks/masks.json
ForgeScan/projects/{projectId}/source/reconstruction-report.json
ForgeScan/projects/{projectId}/exports/export-targets.json
ForgeScan/projects/{projectId}/exports/segmentation-plan.json
ForgeScan/projects/{projectId}/exports/reconstruction-plan.json
ForgeScan/projects/{projectId}/exports/reconstruction-job.json
ForgeScan/projects/{projectId}/exports/splatting-job.json
```

If real `.ksplat` optimization is available, this file may exist:

```text
ForgeScan/projects/{projectId}/photoreal/ForgeScan_{projectName}.ksplat
```

If real `.ksplat` optimization is not available, this file must not be faked.

Fallback/internal artifacts may exist:

```text
ForgeScan/projects/{projectId}/fallback/model.obj
ForgeScan/projects/{projectId}/fallback/point-cloud.ply
ForgeScan/projects/{projectId}/masks/raw/{rotation}/frame_001.png
ForgeScan/projects/{projectId}/masks/refined/{rotation}/frame_001.png
```

## Acceptance Criteria

- No normal user-facing photogrammetry route.
- No normal user-facing mesh export route.
- No normal user-facing OBJ/GLB/STL/USDZ/PLY export.
- No normal user-facing JSON, masks, frames, project folder, viewer HTML, or logs export.
- `.ksplat` is the primary output.
- MP4/GIF are preview-only exports.
- Normal export UI only shows `.ksplat`, `preview.mp4`, and `preview.gif`.
- Advanced Details contains internal artifacts.
- Typecheck passes.
