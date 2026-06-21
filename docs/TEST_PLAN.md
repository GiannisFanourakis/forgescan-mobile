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
12. Tap `Export .ksplat`.
13. Confirm normal export UI only shows:
    - `ForgeScan_{projectName}.ksplat`
    - `preview.mp4`
    - `preview.gif`
14. Confirm `preview.mp4` and `preview.gif` show `Requires native preview rendering`.
15. Confirm internal masks/JSON/logs/viewer/source files appear only in Advanced Details.

## Android Real Engine Test

Requirements:

- Physical Android phone.
- Android development/native build, not Expo Go.
- Android SDK installed.
- USB debugging enabled.
- Good lighting and static background.
- Object on a turntable or stable surface.
- BiRefNet model at `assets/models/masking/birefnet.onnx`.

Commands:

```bash
npm install
npm run typecheck
npm run model:birefnet:install
npm run model:birefnet:check
npx expo prebuild
npx expo run:android
```

Phone flow:

1. Open Android dev build.
2. Open `Native Engine Diagnostics`.
3. Tap `Test BiRefNet Model Load`.
4. If `assets/models/masking/birefnet.onnx` is missing, confirm:
   - `BiRefNet model exists` fails.
   - The message says `BiRefNet model is missing. Add the model at assets/models/masking/birefnet.onnx.`
   - Temporary DeepLab is shown as fallback if bundled.
5. If BiRefNet model is present, confirm:
   - model exists
   - model loaded
   - inference backend is `onnxruntime`
6. Tap `Run One-Frame BiRefNet Mask Test`.
7. Pass only if:
   - BiRefNet inference passes
   - PNG mask output path is shown
   - PNG mask size is greater than 0
8. Tap `Test Gaussian Splat Optimizer`.
9. Confirm:
   - optimizer backend is `trainable-3dgs-android-v1`
   - trainable loop is available
   - coarse fallback is available
   - `.ksplat` writer status is `experimental-ksplat`
   - production 3DGS is not implemented
10. Tap `Run Tiny Gaussian Training Test`.
11. Pass only if:
    - iterations are greater than 0
    - Gaussian count is greater than 0
    - final loss is shown
    - optimizer runtime status is `trainable-loop-complete` or a specific blocker is shown
    - smoke `.ksplat` exists and size is greater than 0
12. Tap `Run Tiny .ksplat Writer Test`.
13. Pass only if writer smoke `.ksplat` exists and size is greater than 0.
14. Confirm smoke-test files are not shown as user scan exports.
15. Create a real scan.
16. Capture upright rotation.
17. Capture tilted rotation.
18. Optional: capture underside rotation.
19. Complete rotations manually.
20. Tap `Create Photoreal Scan`.
21. Confirm object masking ran:
    - `birefnet-complete` if BiRefNet model is installed and inference passed
    - `temporary-deeplab-fallback` if BiRefNet is missing and fallback model ran
    - `fallback-local` only if native masking failed
22. Confirm at least one real mask file exists and size is greater than 0.
23. Confirm Gaussian optimizer ran:
    - `trainable-v1` when Android Gaussian Splat V1 loop succeeds
    - `coarse-v1` only if coarse fallback was needed
24. Confirm `.ksplat` exists, filename ends in `.ksplat`, and size is greater than 0.
25. Confirm `.ksplat` writer status is shown.
26. Confirm warning says Android V1 is not final production 3DGS quality.
27. Tap `Export .ksplat`.
28. Confirm Export shows only:
    - `ForgeScan_{projectName}.ksplat`
    - `preview.mp4`
    - `preview.gif`
29. Confirm preview MP4/GIF status is `Requires native preview rendering`.
30. Confirm `.ksplat` export is blocked unless validation passes.

## Full Android Scan Test Button

In `Native Engine Diagnostics`, `Run Full Android Scan Test` must fail with exact messages:

- `no captured frames`
- `required rotation incomplete`
- `masking model missing`
- `bad model load`
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

## Acceptance Criteria

- App builds as Android dev build.
- Real camera capture works.
- BiRefNet ONNX path exists and fails clearly if model is missing.
- Temporary DeepLab fallback runs only as fallback.
- At least one real mask file is created and size is greater than 0.
- Android Gaussian Splat V1 trainable loop runs on phone.
- Coarse V1 fallback remains available.
- `.ksplat` exists and size is greater than 0 before status is Generated.
- Quality tier is `trainable-v1` or `coarse-v1`.
- App warns this is not production Gaussian training.
- Normal export UI only shows `.ksplat`, `.mp4`, and `.gif`.
- Preview MP4/GIF are marked as requiring future native preview rendering.
- BiRefNet is not claimed as running unless actual model inference succeeds.
- React Native New Architecture remains disabled unless the Windows long-path issue is fixed and verified.

## Failure Cases

- Missing BiRefNet model.
- Bad BiRefNet model load.
- Segmentation output missing.
- `.ksplat` missing.
- `.ksplat` zero bytes.
- Android build failure.
- Windows long-path native C++ build issue.
- New Architecture accidentally re-enabled.
- Normal export UI exposes masks, JSON, OBJ, GLB, PLY, logs, frames, project folders, or smoke-test files.
