# ForgeScan Masking Assets

Android V1 uses Google ML Kit Subject Segmentation as the default on-phone masking engine.

No bundled segmentation model is required or supported in this project path.

The native ML Kit runtime is added by:

```text
plugins/withForgeScanNativeEngines.js
```

Current optional local assets:

```text
assets/models/masking/mobile-segmentation.tflite
```

That file is retained only as a historical/local fallback asset. The normal Android masking path is ML Kit.
