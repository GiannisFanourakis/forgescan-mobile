# ForgeScan Mobile Roadmap

## Current Executable Prototype

- Real Android CameraX capture.
- Manual ISO/shutter/focus through Camera2 interop on supported Android hardware.
- Unlimited frame capture with recommended presets.
- Manual rotation completion.
- Local project persistence.
- Android ML Kit Subject Segmentation masking path.
- Android Gaussian Splat V1 trainable loop.
- Validated `.ksplat` export gate.

## Improve Segmentation Quality

- Improve ML Kit mask quality and fallback thresholds.
- Add preview overlay rendering in-app.
- Track mask confidence and per-frame failures.
- Add batch retry for failed masks.

## Integrate True AI Background Removal

- Optimize native Android ONNX Runtime masking.
- Add native iOS Vision/Core ML path.
- Keep `SegmentationEngine` adapter stable so model replacement does not rewrite UI.

## Improve Rough Reconstruction

- Use mask bounds and silhouettes to estimate volume.
- Build a layered turntable mesh.
- Add texture projection from captured frames.
- Improve point cloud density and alignment confidence.

## Native Photogrammetry

- Android: ARCore pose/depth, OpenCV feature matching, Kotlin/C++ NDK reconstruction.
- iOS: ARKit pose tracking, Vision masks, RealityKit/Object Capture style evaluation, Metal acceleration.
- Add native capability checks and device-tiered fallbacks.

## Gaussian Splatting Optimizer

- Improve Android Gaussian Splat V1 quality and speed.
- Add verified production `.ksplat` writer compatibility.
- Add preview support for `.ksplat`.

## GLB/USDZ Export Generation

- Promote full-run test GLB/USDZ generation into package writer when robust.
- Add real material and texture export.
- Validate GLB and USDZ in platform viewers.

## MP4/GIF Preview Generation

- Current full-run MP4/GIF are lightweight test artifacts.
- Add native turntable render capture.
- Export real animated previews from viewer or native renderer.

## Technical Risks

- Expo Go cannot run heavy native reconstruction modules.
- On-device memory and thermal pressure may limit full reconstruction.
- Camera permissions and vendor camera behavior vary by device.
- True photogrammetry quality depends on lighting, texture, reflections, and frame coverage.
- Large projects can create storage pressure.
