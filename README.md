# ForgeScan Mobile

ForgeScan Mobile is a controlled object splatting app with turntable-style capture.

```text
Capture -> Splatting -> Preview -> Export
```

Normal user flow:

```text
1. Capture
2. Process Scan
3. Preview & Export
```

Normal user-facing exports are only:

```text
ForgeScan_{projectName}.ksplat
preview.mp4
preview.gif
```

Everything else is internal project data.

## Current Android Truth

- Android dev build is the first real engine target.
- Expo Go supports UI and capture fallback only; native engines are unavailable there.
- Current capture uses the in-app Expo camera with ForgeScan controls, zoom, timed burst, photo, and video modes.
- Video mode requests 4K/2160p when selected; actual 4K/60 availability depends on what Android exposes to the app camera API.
- Native Camera2 hardware diagnostics are installed to inspect manual control, RAW, OIS/video stabilization, logical multi-camera, physical lenses, focal lengths, and native zoom.
- Full OEM-style camera control requires replacing capture with a native CameraX/Camera2 surface. The phone's stock camera app cannot run ForgeScan's controlled frame/pose/mask/splat pipeline directly.
- Android V1 defaults to Google ML Kit Subject Segmentation for on-phone object/background masking.
- Android masking is ML Kit-first.
- ARCore availability is checked in the native module. If live ARCore tracking is unavailable, ForgeScan uses turntable pose assumptions.
- Android Gaussian Splat V1 is local/on-phone and limited.
- The `.ksplat` writer status is `experimental-ksplat`; it writes a real non-empty file and validates existence/size, but broad viewer compatibility is not claimed.
- `preview.mp4` and `preview.gif` require future native preview rendering.
- React Native New Architecture is disabled to avoid Windows long-path native C++ build failures.

No fake `.ksplat` is created. `.ksplat` is marked Generated only when the file exists and size is greater than 0.

## Android Processing Order

```text
validate capture
-> prefer ARCore metadata when present
-> otherwise use turntable pose assumptions
-> ML Kit Subject Segmentation masks at confidence >= 0.85
-> temporary DeepLab or fallback-local only if ML Kit is unavailable/fails
-> verify mask file exists and size > 0
-> trainable-3dgs-android-v1
-> coarse-on-device-splat-v1 fallback if trainable V1 fails
-> write ForgeScan_{projectName}.ksplat
-> validate extension, existence, and size > 0
-> register/export .ksplat
```

Internal masks are written to:

```text
advanced/masks/raw/{rotation}/frame_001.png
advanced/masks/refined/{rotation}/frame_001.png
```

Internal optimizer input is written to:

```text
advanced/splatting/ksplat-optimizer-input.json
```

## Native Engine Diagnostics

`Native Engine Diagnostics` remains a developer troubleshooting route.
It is not shown in the normal home flow.

Buttons:

- `Test Android Camera Hardware`
- `Test ML Kit Availability`
- `Run One-Frame ML Kit Mask Test`
- `Start ARCore Keyframe Capture Test`
- `Test Gaussian Splat Optimizer`
- `Run Tiny Gaussian Training Test`
- `Run Tiny .ksplat Writer Test`
- `Run Full Android Scan Test`

Diagnostics show Android camera hardware support, ML Kit status, mask threshold, ARCore availability, fallback pose status, optimizer status, `.ksplat` writer status, last output paths/sizes, and native errors.

## Commands

```bash
npm install
npm run typecheck
npx expo prebuild
npx expo run:android
```

Metro:

```bash
npm run start
```

There is no `npm test` script yet.

Windows SDK/JDK environment example:

```powershell
$env:JAVA_HOME="$env:LOCALAPPDATA\Programs\Temurin\jdk-17"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT="$env:LOCALAPPDATA\Android\Sdk"
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"
```

## Known Limitations

- Live ARCore camera-session keyframe capture is prepared as a native module boundary; the current smoke test writes internal fallback keyframe metadata when live tracking is not active.
- Android Gaussian Splat V1 is a small phone-safe optimizer, not production 3DGS.
- GPU/Vulkan compute is prepared only; CPU/local V1 is the working path.
- `.ksplat` writer is experimental.
- MP4/GIF preview rendering is not implemented yet.
- iOS native engines remain secondary.
