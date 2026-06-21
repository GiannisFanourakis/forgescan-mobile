# ForgeScan Mobile

ForgeScan Mobile is a controlled object splatting app with turntable-style capture.

```text
Capture -> Splatting -> Preview -> Export
```

Normal user-facing exports are only:

```text
ForgeScan_{projectName}.ksplat
preview.mp4
preview.gif
```

Everything else is internal or Advanced Details only.

## Current Android Truth

- Android dev build is the first real engine target.
- BiRefNet ONNX Runtime loader, preprocessing, inference call, mask postprocessing, and PNG writing are implemented.
- BiRefNet is installed at `assets/models/masking/birefnet.onnx`; diagnostics must still pass on the Android phone before the app reports it as active.
- Temporary DeepLab TensorFlow Lite segmentation is bundled as fallback at `assets/models/masking/mobile-segmentation.tflite`.
- Android Gaussian Splat V1 training is implemented as a small on-phone CPU optimization loop.
- Coarse V1 splat construction remains as fallback if trainable V1 fails.
- Production Gaussian Splat training is not implemented.
- The `.ksplat` writer status is `experimental-ksplat`; it writes a real non-empty file and validates existence/size, but broad viewer compatibility is not claimed.
- `preview.mp4` and `preview.gif` require future native preview rendering.
- React Native New Architecture is disabled to avoid Windows long-path native C++ build failures.
- Expo Go supports UI/capture fallback only; native masking and `.ksplat` generation require Android dev build.

No fake `.ksplat` is created.

## What Works

- Create and load local scan projects.
- Capture real camera photos, timed bursts, and muted video clips.
- Capture unlimited/custom frame counts across 2 or 3 rotations.
- Complete rotations manually.
- Review frame counts and coverage tiers.
- Run `Create Photoreal Scan`.
- Run `Native Engine Diagnostics`.
- Test BiRefNet model load.
- Run one-frame BiRefNet mask test when the model is present.
- Run tiny Android Gaussian training smoke test.
- Run tiny `.ksplat` writer smoke test.
- Run full Android scan test against the latest captured project.
- Export the validated `.ksplat` status plus preview media status.

## Android Processing Order

Android dev build scan flow:

```text
validate capture
-> BiRefNet ONNX masking if assets/models/masking/birefnet.onnx exists and loads
-> temporary DeepLab TFLite fallback if BiRefNet is missing/unavailable
-> fallback-local artifacts only if native model masking fails
-> verify mask file exists and size > 0
-> trainable-3dgs-android-v1
-> coarse-on-device-splat-v1 fallback if trainable V1 fails
-> write ForgeScan_{projectName}.ksplat
-> validate extension, existence, and size > 0
-> register/export .ksplat
```

Trainable V1 optimizer details:

- Initializes Gaussians from masked turntable frames.
- Estimates frame yaw from rotation order.
- Projects Gaussians into training views.
- Computes masked photometric loss.
- Updates Gaussian color, opacity, scale, and small position offsets.
- Writes `.ksplat`.
- Reports iteration count, Gaussian count, final loss, duration, and quality tier.

Quality tiers:

- `trainable-v1`: Android Gaussian Splat V1 loop ran.
- `coarse-v1`: coarse fallback generated the file.
- `smoke-test`: diagnostics-only writer test.

## Masking Models

Primary model path:

```text
assets/models/masking/birefnet.onnx
```

Install/check command:

```bash
npm run model:birefnet:install
npm run model:birefnet:check
```

Temporary fallback:

```text
assets/models/masking/mobile-segmentation.tflite
```

If BiRefNet is missing, diagnostics show:

```text
BiRefNet model is missing. Add the model at assets/models/masking/birefnet.onnx.
```

Do not call BiRefNet active until `Test BiRefNet Model Load` and `Run One-Frame BiRefNet Mask Test` pass on the Android phone.

## Native Engine Diagnostics

Open `Native Engine Diagnostics` from the home screen.

Buttons:

- `Test BiRefNet Model Load`
- `Run One-Frame BiRefNet Mask Test`
- `Test Gaussian Splat Optimizer`
- `Run Tiny Gaussian Training Test`
- `Run Tiny .ksplat Writer Test`
- `Run Full Android Scan Test`

Diagnostics show:

- Android dev build detected.
- React Native New Architecture status and reason.
- Temporary DeepLab model present/missing.
- BiRefNet model present/missing.
- Active masking engine.
- BiRefNet smoke mask output path and size.
- Trainable Gaussian V1 engine availability.
- Tiny Gaussian training result.
- Tiny `.ksplat` writer result.
- Last `.ksplat` path, size, and quality tier.
- Production 3DGS status.
- MP4/GIF preview rendering status.
- Last native error.

Smoke-test files are not user scan exports.

## Normal Export UI

Normal Export shows only:

- `ForgeScan_{projectName}.ksplat`
- `preview.mp4`
- `preview.gif`

Normal users do not see masks, JSON, OBJ, GLB, PLY, logs, source frames, project folders, or smoke-test files as export options.

## Commands

```bash
npm install
npm run typecheck
npm run start
```

Optional BiRefNet readiness check:

```bash
npm run model:birefnet:check
```

There is no `npm test` script yet.

Android dev build:

```bash
npm install
npm run typecheck
npx expo prebuild
npx expo run:android
```

Windows SDK/JDK environment example:

```powershell
$env:JAVA_HOME="$env:LOCALAPPDATA\Programs\Temurin\jdk-17"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"
```

## Real Phone Test Flow

1. Install BiRefNet with `npm run model:birefnet:install`.
2. Confirm `assets/models/masking/birefnet.onnx` exists.
3. Run `npm install`.
4. Run `npm run typecheck`.
5. Run `npm run model:birefnet:check`.
6. Run `npx expo prebuild`.
7. Run `npx expo run:android`.
8. Open the Android dev build.
9. Open `Native Engine Diagnostics`.
10. Tap `Test BiRefNet Model Load`.
11. Tap `Run One-Frame BiRefNet Mask Test`.
12. Confirm BiRefNet loads, inference runs, and a real mask PNG size is greater than 0.
13. Tap `Test Gaussian Splat Optimizer`.
14. Tap `Run Tiny Gaussian Training Test`.
15. Confirm the optimizer runtime reports `trainable-loop-complete` or shows a specific blocker.
16. Tap `Run Tiny .ksplat Writer Test`.
17. Create a real scan.
18. Capture upright rotation.
19. Capture tilted rotation.
20. Complete rotations manually.
21. Tap `Create Photoreal Scan` or `Run Full Android Scan Test`.
22. Confirm masks exist and size is greater than 0.
23. Confirm trainable V1 or coarse fallback ran.
24. Confirm `.ksplat` exists and size is greater than 0.
25. Confirm Export shows only `.ksplat`, `preview.mp4`, and `preview.gif`.
26. Confirm `.ksplat` export is blocked unless validation passes.

## Known Limitations

- BiRefNet ONNX is a large bundled dev asset; production packaging should revisit model size and performance.
- Temporary DeepLab fallback may not isolate every object perfectly.
- Android Gaussian Splat V1 is a small CPU training loop, not production 3DGS.
- `.ksplat` writer is experimental.
- Production Gaussian Splat training is not implemented.
- MP4/GIF preview rendering is not implemented.
- iOS native engines remain contract-only.
- React Native New Architecture remains disabled for Windows build stability.
