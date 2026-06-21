# ForgeScan Mobile Test Plan

This plan verifies:

```text
Capture -> Splatting -> Preview -> Export
```

Normal export UI must show only:

```text
ForgeScan_{projectName}.ksplat
preview.mp4
preview.gif
```

## Expo Go Fallback

1. Run `npm install`.
2. Run `npm run typecheck`.
3. Run `npm run start`.
4. Open the app in Expo Go.
5. Create a project.
6. Capture required rotations.
7. Open Project Review.
8. Tap `Create Photoreal Scan`.
9. Confirm native masking reports development/native build required or fallback object preparation is clearly marked.
10. Confirm native `.ksplat` generation reports development/native build required.
11. Confirm no fake `.ksplat` is created.
12. Confirm normal export UI only shows:
    - `ForgeScan_{projectName}.ksplat`
    - `preview.mp4`
    - `preview.gif`
13. Confirm internal masks, JSON, logs, source frames, project folders, and smoke-test files appear only in Advanced Details.

## Android Real V1 Test

Requirements:

- Physical Android phone.
- Android development/native build, not Expo Go.
- Android SDK installed.
- USB debugging enabled.
- Good lighting and static background.
- Object on a turntable or stable surface.

Commands:

```bash
npm install
npm run typecheck
npx expo prebuild
npx expo run:android
```

Phone flow:

1. Open Android dev build.
2. Open `Native Engine Diagnostics`.
3. Tap `Test ML Kit Availability`.
4. Confirm ML Kit Subject Segmentation is available or a clear unavailable reason is shown.
5. Confirm confidence threshold is `0.85`.
6. Tap `Run One-Frame ML Kit Mask Test`.
7. Pass only if a real PNG mask exists and size is greater than 0.
8. Tap `Start ARCore Keyframe Capture Test`.
9. Confirm ARCore availability is shown.
10. If ARCore live tracking is unavailable, confirm warning says `ARCore tracking unavailable. Using turntable pose assumptions.`
11. Confirm `advanced/camera/keyframes.json` is written for the internal smoke test when frames exist.
12. Tap `Test Gaussian Splat Optimizer`.
13. Confirm optimizer backend is `trainable-3dgs-android-v1`.
14. Confirm `.ksplat` writer status is `experimental-ksplat` or `valid-ksplat`.
15. Tap `Run Tiny Gaussian Training Test`.
16. Pass only if iterations, Gaussian count, final loss, and a non-empty smoke `.ksplat` are shown.
17. Tap `Run Tiny .ksplat Writer Test`.
18. Pass only if writer smoke `.ksplat` exists and size is greater than 0.
19. Confirm smoke-test files are not shown as user scan exports.
20. Create a real scan.
21. Capture 40-60 keyframes or normal upright/tilted rotations.
22. Optional: capture underside rotation.
23. Complete rotations manually.
24. Tap `Create Photoreal Scan`.
25. Confirm object masking ran:
    - `mlkit-complete` when ML Kit inference passed
    - `fallback-local` only if native masking failed
26. Confirm at least one real mask file exists and size is greater than 0.
27. Confirm optimizer input includes camera matrices when available or turntable assumptions when ARCore pose is missing.
28. Confirm Android splat optimizer V1 runs.
29. Confirm `.ksplat` exists, filename ends in `.ksplat`, and size is greater than 0.
30. Confirm `.ksplat` writer status is shown.
31. Confirm warning says Android V1 is not final production 3DGS quality when applicable.
32. Confirm Export shows only:
    - `ForgeScan_{projectName}.ksplat`
    - `preview.mp4`
    - `preview.gif`
33. Confirm preview MP4/GIF status is `Requires native preview rendering`.
34. Confirm `.ksplat` export is blocked unless validation passes.

## Full Android Scan Test Button

In `Native Engine Diagnostics`, `Run Full Android Scan Test` must fail clearly for:

- `no captured frames`
- `required rotation incomplete`
- `mask output missing`
- `coarse splat V1 failed`
- `.ksplat missing`
- `.ksplat zero bytes`

It passes only if:

- active project exists
- capture validates
- masking writes at least one non-empty mask
- trainable V1 or coarse fallback writes a non-empty `.ksplat`
- quality tier is shown
- production 3DGS remains marked not implemented

## Failure Cases

- ARCore unavailable.
- ML Kit unavailable.
- Mask generation failed.
- Splat optimizer failed.
- `.ksplat` missing.
- `.ksplat` zero bytes.
- Android build failure.
- New Architecture accidentally re-enabled.
- Normal export UI exposes masks, JSON, OBJ, GLB, PLY, logs, frames, project folders, or smoke-test files.
