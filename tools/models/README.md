# ForgeScan Model Setup

ForgeScan Android masking uses ONNX Runtime for BiRefNet.

Expected BiRefNet path:

```text
assets/models/masking/birefnet.onnx
```

Install the official smaller BiRefNet ONNX release asset with:

```bash
npm run model:birefnet:install
```

Install a local converted model instead with:

```bash
npm run model:birefnet:install -- --source /path/to/birefnet.onnx
```

Check whether the model is installed and valid:

```bash
npm run model:birefnet:check
```

After installing the model, run:

```bash
npx expo prebuild --no-install
npx expo run:android
```

The config plugin copies the model into:

```text
android/app/src/main/assets/models/masking/birefnet.onnx
```

Use `Native Engine Diagnostics` in the app to verify:

- BiRefNet model exists.
- BiRefNet model loads through ONNX Runtime.
- One-frame BiRefNet inference passes.
- PNG mask output exists and size is greater than 0.
