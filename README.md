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
- Expo Go is UI-only for camera capture now; the capture screen reports that a native Android build is required.
- Android dev build uses ARCore Tracked Capture as the recommended real scan path.
- The real scan path does not launch the Android stock camera app. Stock camera intents/plain MP4 are unsuitable for Gaussian Splat training because they do not provide synchronized camera pose matrices.
- ARCore Tracked Capture starts a native ARCore SharedCamera-capable session, saves real image frames, and writes camera intrinsics/extrinsics to `advanced/camera/keyframes.json` when ARCore tracking is available.
- Basic Camera Capture remains fallback/debug capture only and is labeled untracked.
- Android dev build uses a native CameraX full-screen preview for ForgeScan controls, pinch/toolbar zoom, timed keyframes, photo fallback, and video fallback.
- Video mode requests CameraX UHD/2160p when selected; actual 4K/60 availability depends on the phone's CameraX quality profiles.
- Native Camera2 hardware diagnostics inspect manual control, RAW, OIS/video stabilization, logical multi-camera, physical lenses, focal lengths, native zoom, ISO range, shutter range, and focus distance.
- Manual ISO/shutter/focus locks run through Camera2 interop on Android devices that expose `MANUAL_SENSOR`.
- Android V1 defaults to Google ML Kit Subject Segmentation for on-phone object/background masking.
- Android masking is ML Kit-first with confidence threshold `0.85`.
- If ARCore pose metadata is missing, ForgeScan warns and uses fallback turntable assumptions. It does not silently treat untracked frames as tracked.
- Android Gaussian Splat V1 is local/on-phone and limited.
- The Android local splat optimizer receives camera intrinsics/extrinsics when available and uses ARCore pose-derived angles instead of turntable assumptions.
- The `.ksplat` writer status is `experimental-ksplat`; it writes a real non-empty file and validates existence/size, but broad viewer compatibility is not claimed.
- `preview.mp4` and `preview.gif` require future native preview rendering.
- React Native New Architecture is disabled to avoid Windows long-path native C++ build failures.

No fake `.ksplat` is created. `.ksplat` is marked Generated only when the file exists and size is greater than 0.

## Android Processing Order

```text
validate capture
-> ARCore Tracked Capture frames + camera poses when available
-> warn and use turntable pose assumptions when frames are untracked
-> ML Kit Subject Segmentation masks at confidence >= 0.85
-> fallback-local only if ML Kit is unavailable/fails
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

Internal camera and optimizer data are written to:

```text
advanced/camera/keyframes.json
advanced/splatting/ksplat-optimizer-input.json
```

## Native Engine Diagnostics

`Native Engine Diagnostics` remains a developer troubleshooting route.
It is not shown in the normal home flow.

Buttons:

- `Test Android Camera Hardware`
- `Test ARCore Availability`
- `Start ARCore Session Test`
- `Capture One Tracked Keyframe`
- `Run Timed Keyframe Capture Test`
- `Test ML Kit Availability`
- `Run One-Frame ML Kit Mask Test`
- `Test Gaussian Splat Optimizer`
- `Run Tiny Gaussian Training Test`
- `Run Tiny .ksplat Writer Test`
- `Run Full Android Scan Test`

Diagnostics show Android camera hardware support, ARCore/SharedCamera status, Camera2 session availability, intrinsics/extrinsics capture, lock support, ML Kit status, mask threshold, optimizer pose source, `.ksplat` writer status, last output paths/sizes, and native errors.

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

- ARCore SharedCamera session/keyframe APIs are implemented for Android dev builds, but device runtime may still return untracked frames when ARCore cannot acquire tracking.
- The current tracked keyframe flow pairs the native CameraX still frame with ARCore pose metadata. A deeper Camera2 shared image stream is still an upgrade path.
- Manual ISO/shutter/focus depends on the device exposing Camera2 `MANUAL_SENSOR`; otherwise the capture menu keeps auto mode.
- Android Gaussian Splat V1 is a small phone-safe optimizer, not production 3DGS.
- GPU/Vulkan compute is prepared only; CPU/local V1 is the working path.
- `.ksplat` writer is experimental.
- MP4/GIF preview rendering is not implemented yet.
- iOS native engines remain secondary.
