# Prepare BiRefNet For Android

The Android runtime expects:

```text
assets/models/masking/birefnet.onnx
```

The default installer downloads the official smaller BiRefNet ONNX release asset:

```text
BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx
```

Install or validate the file:

```bash
npm run model:birefnet:install
npm run model:birefnet:check
```

Install a local converted model instead:

```bash
npm run model:birefnet:install -- --source /path/to/birefnet.onnx
```

After installing the file:

```bash
npm run typecheck
npx expo prebuild --no-install
npx expo run:android
```

Phone validation:

1. Open `Native Engine Diagnostics`.
2. Tap `Test BiRefNet Model Load`.
3. Confirm `BiRefNet model exists` and `BiRefNet loaded` pass.
4. Confirm the inference backend is `onnxruntime`.
5. Tap `Run One-Frame BiRefNet Mask Test`.
6. Confirm `BiRefNet inference` passes and the mask output has non-zero size.

Do not claim BiRefNet is running until those diagnostics pass on device.
