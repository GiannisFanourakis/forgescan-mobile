# ForgeScan Mobile Test Plan

This plan verifies the simple normal flow:

```text
1. Capture
2. Process Scan
3. Preview & Export
```

Normal export UI must show only:

```text
ForgeScan_{projectName}.ksplat
preview.mp4
preview.gif
```

## Expo Go UI Check

1. Run `npm install`.
2. Run `npm run typecheck`.
3. Run `npm run start`.
4. Open the app in Expo Go.
5. Create a project.
6. Open a capture rotation.
7. Confirm the capture screen says native CameraX is not installed or native build is required.
8. Confirm no Expo camera preview opens.
9. Tap `Create .ksplat Preview`.
10. Confirm Project Review opens in the three-step layout.
11. Confirm Expo Go clearly reports that native `.ksplat` generation requires a native build or uses a clearly marked fallback.
12. Confirm no fake `.ksplat` is created.
13. Confirm Preview & Export shows only:
    - `ForgeScan_{projectName}.ksplat`
    - `preview.mp4`
    - `preview.gif`

## Android Stable Camera Capture Test

Current POCO X7 Pro test status: ARCore tracked capture is disabled in this build after a native ARCore runtime crash. Use this test to verify the app stays stable while capturing video through the native camera path.

1. Run `npm install`.
2. Run `npm run typecheck`.
3. Run `npx expo run:android`.
4. Open the Android dev build.
5. Create a project.
6. Open a capture rotation.
7. Confirm the camera preview covers the full screen.
8. Confirm the capture mode is video-only and says `Basic capture / ARCore off`.
9. Record one short video.
10. Confirm the app does not crash.
11. Stop recording and confirm the clip appears under `Clips`.
12. Confirm the app does not return to a black preview.
13. Pinch the preview and confirm zoom changes.
14. Record a smooth full-turn video.
15. Complete the rotation.

## Android Real Tracked Scan Test

This test is paused for the current POCO X7 Pro build because starting ARCore caused a native `libarcore_c.so` crash. The app must report ARCore as disabled instead of starting the session.

Requirements:

- Physical Android phone.
- Android development/native build, not Expo Go.
- Android SDK installed.
- USB debugging enabled.
- ARCore-capable phone.
- Good lighting and static background.
- Object on a turntable or stable surface.

Commands:

```bash
npm install
npm run typecheck
npx expo prebuild
npx expo run:android
npm run start
```

Phone flow:

1. Open the Android dev build.
2. Open `Native Engine Diagnostics`.
3. Tap `Test ARCore Availability`.
4. Confirm ARCore reports disabled on the current POCO X7 Pro build.
5. Do not start the ARCore session on this device until the native ARCore crash is resolved.
7. Create a project.
8. Open the first capture rotation.
9. Confirm the camera preview covers the full screen.
10. Confirm the capture mode is video-only and says `Basic capture / ARCore off`.
11. Pinch on the preview and confirm zoom changes.
12. Confirm `Start Tracked` is unavailable or reports ARCore disabled.
13. Capture one Basic frame.
14. Confirm the app stays running and does not start ARCore.
15. Confirm the capture screen shows:
   - Capture path
   - Last frame source
   - Pose synchronization
   - Intrinsics yes/no
   - Extrinsics yes/no
   - Pose matrix valid/invalid/missing
   - Tracking state
   - Rotation tracked frame count
   - Rotation usable-for-splat count
16. Record one smooth upright full-turn video.
17. Record one smooth tilted full-turn video.
18. Optional: record one underside full-turn video.
19. Complete the rotations manually.
20. Tap `Create .ksplat Preview`.
21. Confirm Project Review shows:
   - `1 Capture`
   - `2 Process`
   - `3 Preview & Export`
22. Confirm `Tracked Capture Readiness` appears with status, total frames, usable tracked frames, and per-rotation usable frame counts.
23. Confirm video-only rotations warn that processing will extract frames and use turntable pose assumptions.
24. Confirm processing starts automatically, or tap `Process Scan`.
25. Confirm object/background removal runs through ML Kit Subject Segmentation.
26. Confirm mask PNG files are written and size is greater than 0.
27. Confirm optimizer input includes `trackedCaptureReadiness` and camera matrices when tracked keyframes were captured.
28. Confirm the Android splat optimizer runs.
29. Confirm `.ksplat` is marked Generated only if the file exists and size is greater than 0.
30. Confirm Preview & Export shows only:
    - `ForgeScan_{projectName}.ksplat`
    - `preview.mp4`
    - `preview.gif`
31. Confirm preview MP4/GIF status is `Requires native preview rendering`.
32. Confirm masks, JSON, OBJ, GLB, PLY, logs, source frames, project folders, and smoke-test files are not shown as normal exports.

## Android Small Tracked-Capture Metadata Test

Use this quick test before a full scan:

1. Create a project in the Android dev build.
2. Open the upright rotation with `Tracked` selected.
3. Capture 5 upright tracked frames.
4. Complete the upright rotation.
5. Open the tilted rotation with `Tracked` selected.
6. Capture 5 tilted tracked frames.
7. Complete the tilted rotation.
8. Open Project Review.
9. Confirm `Tracked Capture Readiness` appears.
10. Confirm frames have intrinsics/extrinsics counts.
11. Confirm pose synchronization is `camera-photo-associated` or `shared-camera-synchronized`.
12. Open `Native Engine Diagnostics`.
13. Tap `Validate Current Tracked Capture`.
14. Confirm usable frame count, missing intrinsics count, missing extrinsics count, invalid pose matrix count, tracking-not-TRACKING count, associated-not-synchronized count, and required rotation readiness are shown.
15. Tap `Export Keyframe Metadata Summary`.
16. Confirm `advanced/camera/keyframe-summary.json` is written.
17. Tap `Show Last Pose Matrix`.
18. Confirm a 16-value pose matrix is shown when tracking is available.

If Basic capture is used instead of Tracked capture, the app must warn:

```text
Untracked capture does not contain camera pose matrices. Results may fail or use rough turntable assumptions.
```

## Troubleshooting Diagnostics

Use `Native Engine Diagnostics` only when the simple flow fails.
It is a developer troubleshooting route, not a normal home-screen option.

Diagnostics buttons:

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

Diagnostics must fail clearly for:

- Android Camera2 hardware unavailable.
- ARCore unavailable.
- SharedCamera session failed.
- Tracking lost.
- No pose matrix.
- Camera setting lock unsupported.
- ML Kit unavailable.
- Mask generation failed.
- Splat optimizer failed.
- `.ksplat` missing.
- `.ksplat` zero bytes.
- Android build failure.
- New Architecture accidentally re-enabled.

Diagnostics pass only when:

- Camera2 diagnostics report at least one back camera and list manual/RAW/OIS/multi-camera support honestly.
- ARCore diagnostics report SharedCamera support honestly.
- One tracked keyframe writes a real image path plus intrinsics/extrinsics when ARCore tracking is available.
- Current Android tracked capture reports `camera-photo-associated` until a true synchronized Camera2 SharedCamera stream is implemented.
- Project Review shows `Tracked Capture Readiness` before processing.
- CameraX native fallback capture reports implemented in Android dev build.
- Manual ISO/shutter/focus controls stay enabled only when Camera2 `MANUAL_SENSOR` is available.
- Masking writes at least one non-empty mask.
- Trainable V1 or coarse fallback writes a non-empty `.ksplat`.
- Quality tier is shown.
- Production 3DGS remains marked not implemented.
