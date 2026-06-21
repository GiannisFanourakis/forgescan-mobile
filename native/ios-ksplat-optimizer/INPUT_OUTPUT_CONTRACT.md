# iOS .ksplat Optimizer Input/Output Contract

Native module name:

```text
ForgeScanKsplatOptimizer
```

Required method:

```swift
runKsplatOptimizer(inputJson: String) async throws -> String
```

Recommended support methods:

```swift
getAvailability() async throws -> String
cancelKsplatOptimizer() async throws
```

Input and output JSON match `native/android-ksplat-optimizer/INPUT_OUTPUT_CONTRACT.md`.

Do not return `generated` unless a real valid `.ksplat` file exists at:

```text
photoreal/ForgeScan_{projectName}.ksplat
```
