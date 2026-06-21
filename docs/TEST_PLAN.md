# ForgeScan Test Phase Plan

This plan covers the first phone-ready prototype phase. The app should be tested on Android and iOS with simulated capture before native camera and reconstruction modules are added.

## Entry Criteria

- App starts from a clean install.
- Projects persist after app restart.
- Simulated frame capture writes stable manifest metadata.
- Project review shows validation results and local package paths.
- Manifest, export target plan, and reconstruction plan can be saved locally.
- Android and iOS support screen describes the native reconstruction paths.

## Android Smoke Test

1. Install and open the app on an Android device or emulator.
2. Tap `Android and iOS Support`.
3. Confirm Android local reconstruction is listed with ARCore, NDK, OpenCV, segmentation, reconstruction, and export stages.
4. Return home and create a new scan.
5. Choose `36` frames and `3 rotations`.
6. Capture at least two simulated frames for each rotation.
7. Complete each rotation.
8. Open Project Review.
9. Confirm validation reports missing frame-count errors until the target frame count is met.
10. Tap `Export Project Manifest`.
11. Tap `Export 3D Format Plan`.
12. Open `Prepare Reconstruction Plan`.
13. Tap `Save Reconstruction Plan`.
14. Close and reopen the app.
15. Confirm the project still appears in Local projects.

## iOS Smoke Test

1. Install and open the app on an iPhone or simulator.
2. Tap `Android and iOS Support`.
3. Confirm iOS local reconstruction is listed with ARKit, Swift, Vision/Core ML, Metal, Object Capture path, and export stages.
4. Return home and create a new scan.
5. Choose `24` frames and `2 rotations`.
6. Capture at least two simulated frames for upright and tilted.
7. Leave underside pending.
8. Open Project Review.
9. Confirm underside is optional and validation warnings/errors are understandable.
10. Tap `Export Project Manifest`.
11. Tap `Export 3D Format Plan`.
12. Open `Prepare Reconstruction Plan`.
13. Tap `Save Reconstruction Plan`.
14. Close and reopen the app.
15. Confirm the project still appears in Local projects.

## Package Files To Inspect

Each saved project should have:

```text
ForgeScan/projects/{projectId}/
  manifest.json
  rotations/
    upright/
    tilted/
    underside/
  thumbnails/
  exports/
    export-targets.json
    reconstruction-plan.json
```

## Known Expected Failures

- Real camera capture is not implemented yet.
- Real image files are not created by simulated capture.
- Background removal is not implemented yet.
- Native Android/iOS reconstruction modules are not implemented yet.
- GLB, USDZ, OBJ, STL, HTML, MP4, and GIF binaries are not generated yet.
