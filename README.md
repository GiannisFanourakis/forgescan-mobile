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
- Android dev build defaults to fixed-camera turntable video capture. This is the primary ForgeScan production path.
- The main capture UI is video-only: keep the camera still, record one smooth full-turn clip per rotation, then processing extracts evenly spaced frames and assigns object rotation poses from the video timeline.
- The real scan path does not launch the Android stock camera app. The app controls capture so it can keep project metadata, extract frames deterministically, and process the clip locally.
- ARCore Tracked Capture code remains in the native module, but normal capture and diagnostics now return a clear disabled result instead of starting ARCore on the affected device path.
- The current verified Android keyframe path pairs CameraX still frames with ARCore pose metadata and marks those frames as `camera-photo-associated`.
- `shared-camera-synchronized` is reserved for a future verified Camera2/SharedCamera image stream. The app records `poseSynchronization` so diagnostics and optimizer input never confuse the two modes.
- Basic Camera Capture is the working stable capture path for the current phone test. It is fixed-camera turntable capture and uses frame-order object rotation for splat processing.
- Android dev build uses a native CameraX full-screen preview for ForgeScan controls, pinch/toolbar zoom, and video capture.
- Video capture requests CameraX UHD/2160p when selected; actual 4K/60 availability depends on the phone's CameraX quality profiles.
- Native Camera2 hardware diagnostics inspect manual control, RAW, OIS/video stabilization, logical multi-camera, physical lenses, focal lengths, native zoom, ISO range, shutter range, and focus distance.
- Manual ISO/shutter/focus locks run through Camera2 interop on Android devices that expose `MANUAL_SENSOR`.
- Android V1 defaults to Google ML Kit Subject Segmentation for on-phone object/background masking.
- Android masking is ML Kit-first with confidence threshold `0.85`.
- With ARCore disabled, ForgeScan uses video-derived fixed-camera turntable poses. It does not need free-camera AR poses for the normal turntable workflow.
- Android fixed-camera turntable Gaussian Splat V1 is local/on-phone.
- The Android local splat optimizer uses frame-order object rotation as the primary production path, and uses camera intrinsics/extrinsics only when a future free-camera tracked capture path is available.
- The `.ksplat` writer status is `experimental-ksplat`; it writes a real non-empty file and validates existence/size, but broad viewer compatibility is not claimed.
- `preview.mp4` and `preview.gif` require future native preview rendering.
- React Native New Architecture is disabled to avoid Windows long-path native C++ build failures.

No fake `.ksplat` is created. `.ksplat` is marked Generated only when the file exists and size is greater than 0.

## Android Processing Order

```text
validate capture
-> record rotation video clips
-> extract evenly spaced frames from video
-> generate fixed-camera turntable object poses from frame index and rotation metadata
-> ML Kit Subject Segmentation masks at confidence >= 0.85
-> fallback-local only if ML Kit is unavailable/fails
-> verify mask file exists and size > 0
-> fixed-camera-turntable-3dgs-android-v1
-> trainable-3dgs-android-v1 fallback if turntable production V1 cannot initialize
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
advanced/camera/keyframe-summary.json
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
- `Validate Current Tracked Capture`
- `Export Keyframe Metadata Summary`
- `Show Last Pose Matrix`
- `Test ML Kit Availability`
- `Run One-Frame ML Kit Mask Test`
- `Test Gaussian Splat Optimizer`
- `Run Tiny Gaussian Training Test`
- `Run Tiny .ksplat Writer Test`
- `Run Full Android Scan Test`

Diagnostics show Android camera hardware support, ARCore/SharedCamera status, Camera2 session availability, intrinsics/extrinsics capture, pose synchronization mode, lock support, ML Kit status, mask threshold, optimizer pose source, `.ksplat` writer status, last output paths/sizes, and native errors.

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

- ARCore SharedCamera session/keyframe APIs are implemented for Android dev builds, but ARCore start/capture is disabled in this build after a native `libarcore_c.so` crash on the POCO X7 Pro test device.
- The current tracked keyframe flow pairs the native CameraX still frame with ARCore pose metadata and is marked `camera-photo-associated`, not `shared-camera-synchronized`.
- A deeper Camera2 SharedCamera synchronized image stream is still future hardening.
- Manual ISO/shutter/focus depends on the device exposing Camera2 `MANUAL_SENSOR`; otherwise the capture menu keeps auto mode.
- Fixed-camera turntable 3DGS V1 is the production target for the current Android app. It is phone-safe and lower quality than desktop CUDA-class 3DGS.
- GPU/Vulkan compute is prepared only; CPU/local V1 is the working path.
- `.ksplat` writer is experimental.
- MP4/GIF preview rendering is not implemented yet.
- iOS native engines remain secondary.
