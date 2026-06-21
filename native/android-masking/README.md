# ForgeScan Android Masking Module

The executable Android source lives in:

```text
native/android/forgescan-engines/
```

Android V1 default path:

```text
React Native UI -> ForgeScanNativeMasking -> ML Kit Subject Segmentation -> advanced/masks/
```

Expo Go does not include this module. In Expo Go, JavaScript reports:

```text
Native AI masking requires a development/native build.
```

Default Android V1 uses Google ML Kit Subject Segmentation with threshold `0.85`.

There is no legacy model diagnostic, installer, model asset, or alternate native inference path.
