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

1. Open the Android dev build.
2. Create a project.
3. Open the first capture rotation.
4. Confirm the camera preview covers the full screen and is powered by native CameraX.
5. Use zoom controls and confirm preview zoom changes.
6. Capture upright rotation with photo or timed burst.
7. Switch to video, select 4K, record a short clip, and stop recording.
8. Capture tilted rotation.
9. Optional: capture underside rotation.
10. Complete the rotations manually.
11. Tap `Create .ksplat Preview`.
12. Confirm Project Review shows:
   - `1 Capture`
   - `2 Process`
   - `3 Preview & Export`
13. Confirm processing starts automatically, or tap `Process Scan`.
14. Confirm object/background removal runs.
15. Confirm splatting runs after masking.
16. Confirm `.ksplat` is marked Generated only if the file exists and size is greater than 0.
17. Confirm Preview & Export shows only:
    - `ForgeScan_{projectName}.ksplat`
    - `preview.mp4`
    - `preview.gif`
18. Confirm preview MP4/GIF status is `Requires native preview rendering`.
19. Confirm masks, JSON, OBJ, GLB, PLY, logs, source frames, project folders, and smoke-test files are not shown as normal exports.

## Troubleshooting Diagnostics

Use `Native Engine Diagnostics` only when the simple flow fails.
It is a developer troubleshooting route, not a normal home-screen option.

Diagnostics buttons:

- `Test Android Camera Hardware`
- `Test ML Kit Availability`
- `Run One-Frame ML Kit Mask Test`
- `Start ARCore Keyframe Capture Test`
- `Test Gaussian Splat Optimizer`
- `Run Tiny Gaussian Training Test`
- `Run Tiny .ksplat Writer Test`
- `Run Full Android Scan Test`

Diagnostics must fail clearly for:

- Android Camera2 hardware unavailable.
- ARCore unavailable.
- ML Kit unavailable.
- Mask generation failed.
- Splat optimizer failed.
- `.ksplat` missing.
- `.ksplat` zero bytes.
- Android build failure.
- New Architecture accidentally re-enabled.

Diagnostics pass only when:

- Camera2 diagnostics report at least one back camera and list manual/RAW/OIS/multi-camera support honestly.
- CameraX native capture reports implemented in Android dev build.
- Masking writes at least one non-empty mask.
- Trainable V1 or coarse fallback writes a non-empty `.ksplat`.
- Quality tier is shown.
- Production 3DGS remains marked not implemented.
