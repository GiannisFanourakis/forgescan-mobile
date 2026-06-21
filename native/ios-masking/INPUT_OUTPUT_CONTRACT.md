# iOS Masking Input/Output Contract

Native module name:

```text
ForgeScanNativeMasking
```

Expected methods:

```swift
getAvailability() async throws -> String
runMasking(inputJson: String) async throws -> String
cancelMasking() async throws
```

Input and output JSON match `native/android-masking/INPUT_OUTPUT_CONTRACT.md`.

Native output must write masks under:

```text
advanced/masks/raw/{rotation}/frame_001.png
advanced/masks/refined/{rotation}/frame_001.png
```

If PNG generation is blocked, native code may emit `.mask.json` artifacts under the same raw/refined folder layout and explain the fallback in warnings.
