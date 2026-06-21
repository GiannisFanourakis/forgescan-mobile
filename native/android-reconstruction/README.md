# ForgeScan Android Reconstruction

This folder is reserved for the Android native reconstruction engine.

Planned stack:

- Kotlin React Native module bridge
- Android NDK/C++ for heavy geometry processing
- ARCore for pose tracking and optional depth maps
- OpenCV for feature matching and image quality checks
- MediaPipe or LiteRT for on-device segmentation
- Vulkan or device GPU acceleration where useful

Initial native API target:

```text
checkCapabilities()
prepareProject(manifestPath)
startReconstruction(projectId)
getProgress(jobId)
exportModel(jobId, format)
cancel(jobId)
```

The shared TypeScript contract lives in `src/reconstruction/`.
