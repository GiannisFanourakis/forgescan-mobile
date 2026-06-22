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

## Expo Go Fallback

1. Run `npm install`.
2. Run `npm run typecheck`.
3. Run `npm run start`.
4. Open the app in Expo Go.
5. Create a project.
6. Capture the required rotations.
7. Tap `Create .ksplat Preview`.
8. Confirm Project Review opens in the three-step layout.
9. Tap `Process Scan` if processing did not start automatically.
10. Confirm background removal and splatting run as one action.
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
3. Capture upright rotation.
4. Capture tilted rotation.
5. Optional: capture underside rotation.
6. Complete the rotations manually.
7. Tap `Create .ksplat Preview`.
8. Confirm Project Review shows:
   - `1 Capture`
   - `2 Process`
   - `3 Preview & Export`
9. Confirm processing starts automatically, or tap `Process Scan`.
10. Confirm object/background removal runs.
11. Confirm splatting runs after masking.
12. Confirm `.ksplat` is marked Generated only if the file exists and size is greater than 0.
13. Confirm Preview & Export shows only:
    - `ForgeScan_{projectName}.ksplat`
    - `preview.mp4`
    - `preview.gif`
14. Confirm preview MP4/GIF status is `Requires native preview rendering`.
15. Confirm masks, JSON, OBJ, GLB, PLY, logs, source frames, project folders, and smoke-test files are not shown as normal exports.

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
- Masking writes at least one non-empty mask.
- Trainable V1 or coarse fallback writes a non-empty `.ksplat`.
- Quality tier is shown.
- Production 3DGS remains marked not implemented.
