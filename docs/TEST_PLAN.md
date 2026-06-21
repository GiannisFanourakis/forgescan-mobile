# ForgeScan Mobile Test Plan

This plan verifies the V3 native-first splatting flow.

Normal user flow:

```text
Capture -> Splatting -> Preview -> Export
```

Normal export UI must only show:

```text
ForgeScan_{projectName}.ksplat
preview.mp4
preview.gif
```

## Path A — Expo Go

1. Run `npm install`.
2. Run `npm run typecheck`.
3. Run `npm run start`.
4. Open the app in Expo Go.
5. Create a project.
6. Capture frames for required rotations.
7. Open Project Review.
8. Tap `Create Photoreal Scan`.
9. Confirm progress messages:
   - Checking capture
   - Preparing object
   - Creating photoreal scan
   - Preparing preview
   - Finished
10. Confirm native masking reports unavailable or fallback masking runs.
11. Confirm `.ksplat` status is `Requires native build`.
12. Confirm no fake `.ksplat` exists.
13. Tap `Export .ksplat`.
14. Confirm normal export UI only shows:
   - `ForgeScan_{projectName}.ksplat`
   - `preview.mp4`
   - `preview.gif`
15. Confirm `preview.mp4` and `preview.gif` show `Requires native processing`.
16. Expand Advanced Details.
17. Confirm Advanced Details lists native availability, internal optimizer input, masks, and diagnostics.

## Path B — Native/Dev Build

1. Run a development/native build with native modules linked.
2. Confirm native masking availability if implemented.
3. Confirm native `.ksplat` optimizer availability if implemented.
4. Capture required rotations.
5. Tap `Create Photoreal Scan`.
6. Confirm native masking runs.
7. Confirm native optimizer runs.
8. Confirm real `.ksplat` is generated at:

```text
photoreal/ForgeScan_{projectName}.ksplat
```

9. Confirm Export marks `.ksplat` as `Generated`.

If native internals are stubbed only, Path B requires completing native engine internals.

## Expected Expo Go Internal Files

Expo Go may create:

```text
ForgeScan/projects/{projectId}/advanced/masks/raw/{rotation}/frame_001.png
ForgeScan/projects/{projectId}/advanced/masks/refined/{rotation}/frame_001.png
ForgeScan/projects/{projectId}/advanced/optimizer/ksplat-optimizer-input.json
ForgeScan/projects/{projectId}/advanced/optimizer/ksplat-result.json
ForgeScan/projects/{projectId}/open_viewer.html
```

If PNG mask writing is blocked, fallback mask artifacts may be:

```text
ForgeScan/projects/{projectId}/advanced/masks/raw/{rotation}/frame_001.mask.json
ForgeScan/projects/{projectId}/advanced/masks/refined/{rotation}/frame_001.mask.json
```

These files are internal and belong only in Advanced Details.

## Acceptance Criteria

- Native processing is the preferred architecture.
- Expo Go reports native masking and native optimizer requirements honestly.
- No fake `.ksplat` is created.
- `.ksplat` is marked Generated only if a real valid `.ksplat` exists.
- Normal export UI only shows `.ksplat`, `preview.mp4`, and `preview.gif`.
- Masks, JSON, OBJ, GLB, PLY, logs, source frames, and project folders are not normal exports.
- Advanced Details is collapsed by default and contains internal diagnostics.
- Typecheck passes.
