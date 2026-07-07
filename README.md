# ForgeScan Mobile

ForgeScan Mobile turns a turntable capture of an object into a textured 3D
model, entirely on-device (Android, Kotlin + Jetpack Compose). Reconstruction
is visual-hull (shape-from-silhouette) voxel carving, not Gaussian Splatting
or NeRF - there is no cloud or AI dependency anywhere in the pipeline.

```text
Capture -> Process -> Preview -> Export
```

## User flow

1. **Capture** - for each "ring" (a named turntable pass at one camera
   elevation - e.g. "Upright", "Underside", or a custom name), either:
   - tap **Capture** to hand off to the phone's stock Camera app, then return
     to ForgeScan and import the photos/video it produced, or
   - **Import** existing photos or a video directly from the system picker.

   A video import auto-extracts up to 120 evenly-spaced frames. A single ring
   is enough to produce a model - multiple rings are supported but not
   required.
2. **Process** - runs the full reconstruction pipeline (below) and moves
   straight to the preview; no manual steps in between.
3. **Preview & Export** - orbitable 3D viewer, then Save GLB to Downloads,
   Share GLB, or Export OBJ (zipped, with its own texture).

## Pipeline (`app/src/main/java/com/forgescan/mobile/`)

| Stage | File(s) | What it does |
|---|---|---|
| Masking | `BackgroundRemoval.kt` | ML Kit Subject Segmentation per frame produces a binary silhouette + soft alpha mask. A brightness/chroma heuristic also tries to exclude the turntable plate itself (imperfectly - it often still ends up fused into the model). |
| Geometry calibration | `TurntableSfm.kt` | OpenCV-based: measures each ring's *real* camera elevation and the object's real top/bottom cap radius from the footage itself (ORB feature matching, essential matrix, triangulation), instead of assuming fixed angles. |
| Carving | `TurntableGeometry.kt`, `VoxelCarver.kt` | 192³ voxel grid carved by silhouette-cone intersection across every populated ring/frame. Tolerates 97% frame agreement (not unanimous) and dilates masks before carving, both to avoid losing thin features to segmentation noise. 26-connectivity component filtering drops carving noise without eating genuine thin geometry; cap-flattening uses the measured cap radius instead of leaving the top/bottom to an unconstrained silhouette guess. |
| Meshing | `VoxelMesher.kt` | Exposed-face quad extraction, vertex welding, Taubin (λ/μ) smoothing. |
| Texturing | `MeshColorizer.kt` | Per-vertex color blended from the top-4 best-matching camera views (weighted by normal alignment), welded/averaged across shared vertices for a smoother result. Also bakes a UV-mapped texture atlas, used by the OBJ export's real texture. |
| Export | `GlbWriter.kt`, `ObjWriter.kt`, `ProjectExporter.kt` | GLB (vertex-colored) and OBJ+MTL+PNG (zipped). |
| Preview | `MeshPreviewScreen.kt` | SceneView/Filament-based orbit viewer. |

`ReconstructionPipeline.kt` runs all of this behind the single "Process" button.

## Current known problem

The in-app GLB preview renders **vertex colors only**, not the real UV
texture atlas `MeshColorizer.kt` bakes. This build's SceneView/Filament
dependency (`io.github.sceneview:sceneview:4.18.0`, pinning Filament
`1.71.5`) never binds embedded glTF `baseColorTexture` images. Confirmed by
decompiling the actual resolved `ResourceLoader.class`: its constructor's own
bytecode registers an STB texture provider for `image/png` - matching
Filament's upstream source at this exact version - yet `Missing texture
provider for image/png` still fires at runtime for every approach tried
(embedded GLB texture via glTF materials, and a manually-constructed
`Texture`/`MaterialInstance` via Filament's core API directly, with and
without mipmaps). Root cause not yet found. The OBJ export's texture is
unaffected, since that path never touches `ResourceLoader` - `map_Kd`
references a plain external PNG file.

Separately, a single-ring capture still loses thin protruding features (a
handle, on the current test object) more often than not. Masks are now
dilated before carving and the carving rule tolerates some per-frame
disagreement, both aimed at this specifically, but neither has yet been
confirmed to reliably recover a real handle from real device footage.

## Build

```bash
./gradlew :app:installDebug
```

Requires a connected device/emulator (`adb devices`). `OpenCVLoader.initLocal()`
(used for the elevation/cap measurements in `TurntableSfm.kt`) loads a native
library bundled by `org.opencv:opencv` for Android; there is no desktop/JVM
equivalent, so those measurements can't be exercised from a plain
`./gradlew test` run on a dev machine - only on-device.

## Repo layout note

Only `:app` (this Kotlin/Compose module) is listed in `settings.gradle.kts`
and actively built. `native/`, `docs/`, and the root-level `assets/` predate
a full rewrite (see git history: "Rewrite ForgeScan Mobile as native
Kotlin/Compose visual-hull pipeline") away from an older React Native/Expo +
Gaussian-Splatting architecture, and aren't referenced by the current build -
`docs/` in particular describes that old design, not this one.

## Known limitations

- Visual hull cannot carve true concavities (e.g. the inside of a handle's
  gap) - only silhouette-consistent solid shapes. A thin *solid* protrusion
  should still be recoverable from a single ring in principle; a true hollow
  would need photo-consistency ("space") carving instead, which this app
  does not implement.
- No traditional camera calibration (no checkerboard/marker) - relies on an
  assumed field of view plus the measured elevation.
- The turntable surface is not reliably excluded from the model yet.
- A single elevation ring leaves the very top/bottom cap shape under-
  constrained by silhouettes alone; the measured cap-radius fix approximates
  it but doesn't replace real coverage from a second ring at a different
  elevation.
