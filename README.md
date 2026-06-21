# ForgeScan Mobile

ForgeScan Mobile is a controlled object splatting app with turntable-style capture.

```text
Capture -> Splatting -> Preview -> Export
```

The normal final 3D export is:

```text
ForgeScan_{projectName}.ksplat
```

Optional normal preview exports:

```text
preview.mp4
preview.gif
```

Everything else is internal or Advanced Details.

## V3 Native-First Target

ForgeScan is designed to go directly for on-phone processing:

- Native/on-phone object masking and background removal.
- Native/on-phone Gaussian Splat optimization.
- Native/on-phone `.ksplat` output.
- Preview.
- Export `.ksplat`.

Intended architecture:

```text
React Native / Expo UI
-> native masking engine
-> native Gaussian Splat optimizer
-> ForgeScan_{projectName}.ksplat
-> Preview
-> Export
```

Expo Go can capture frames, prepare internal data, run fallback masking, and show the correct status. Real `.ksplat` generation requires a development/native build until the native optimizer module is implemented and linked.

No fake `.ksplat` is created.

## What Works Now

- Create local scan projects.
- Choose 2 rotations or 3 rotations.
- Capture real camera photos, timed bursts, and muted video clips.
- Capture unlimited frames per rotation.
- Complete each rotation manually.
- Show actual frame counts and coverage quality.
- Run one user-facing action: `Create Photoreal Scan`.
- Prefer native masking and native `.ksplat` optimization when modules are available.
- In Expo Go, report native masking and native `.ksplat` optimizer as requiring a development/native build.
- Use fallback local masking only as a secondary Expo Go path.
- Save optimizer input internally for native/dev-build processing.
- Keep masks, JSON, OBJ, GLB, PLY, source frames, logs, and folders out of the normal export UI.

## Product Flow

### Capture

Create a project, choose 2 or 3 rotations, and capture unlimited images. More frames improve coverage, but presets are guidance only.

### Splatting

Tap `Create Photoreal Scan`.

The app runs:

1. Capture validation.
2. Native masking if available.
3. Fallback masking if native masking is unavailable.
4. Native `.ksplat` optimizer input creation.
5. Native optimizer if available.
6. Preview preparation.

In Expo Go, the app shows:

```text
Native processing is required to generate .ksplat.
```

### Preview

Preview prioritizes `.ksplat`.

If `.ksplat` is generated in a native/dev build, Preview can show it as Generated. If not, Preview clearly says native processing is required and only shows fallback preview status.

### Export

Normal Export only shows:

- `ForgeScan_{projectName}.ksplat`
- `preview.mp4`
- `preview.gif`

Statuses are one of:

- Generated
- Requires native build
- Requires native processing
- Not available
- Failed

Advanced Details are collapsed by default and contain internal diagnostics only.

## Native Modules

Native contracts live under:

```text
native/android-masking/
native/ios-masking/
native/android-ksplat-optimizer/
native/ios-ksplat-optimizer/
```

The production native optimizer must write:

```text
photoreal/ForgeScan_{projectName}.ksplat
```

Do not return `generated` unless a real valid `.ksplat` file exists.

## Internal Files

Current Expo Go internal files may include:

```text
advanced/masks/raw/{rotation}/frame_001.png
advanced/masks/refined/{rotation}/frame_001.png
advanced/optimizer/ksplat-optimizer-input.json
advanced/optimizer/ksplat-result.json
open_viewer.html
source/
fallback/
exports/
```

These are not normal user exports.

## Run

```bash
npm install
npm run typecheck
npm run start
```

There is no `npm test` script in this prototype yet.

## Manual Test

1. Open the app.
2. Create a project.
3. Capture frames for required rotations.
4. Open Project Review.
5. Tap `Create Photoreal Scan`.
6. In Expo Go, confirm `.ksplat` status is `Requires native build`.
7. Tap `Export .ksplat`.
8. Confirm normal export UI only shows `.ksplat`, `preview.mp4`, and `preview.gif`.
9. Expand Advanced Details for native availability, fallback masks, optimizer input, and internal diagnostics.

## Known Limitations

- Expo Go cannot run the native masking or native `.ksplat` optimizer modules.
- Path B native/dev-build processing requires implementing and linking native engine internals.
- Fallback masking is not production AI matting.
- `preview.mp4` and `preview.gif` require native preview rendering.
- Internal fallback OBJ/PLY files may exist for diagnostics only; they are not normal exports.
