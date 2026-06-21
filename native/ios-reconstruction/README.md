# ForgeScan iOS Reconstruction

This folder is reserved for the iOS native reconstruction engine.

Planned stack:

- Swift React Native module bridge
- ARKit/RealityKit for camera tracking and platform reconstruction paths
- Vision or Core ML for on-device segmentation
- Metal-backed processing for heavy image and geometry work
- USDZ-first export support, plus GLB/OBJ/STL writers where practical

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
