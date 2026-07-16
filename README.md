# ForgeScan Mobile

ForgeScan Mobile turns a turntable capture of an object into a real, trained
3D Gaussian Splat (Android, Kotlin + Jetpack Compose). Capture happens
on-device; reconstruction (COLMAP/hloc registration + `ns-train splatfacto`)
runs on a Modal-hosted backend (`forgescan-backend`, sibling repo) - see
"Cloud training" below.

```text
Capture -> Upload & Train (Cloud) -> View Splat
```

## User flow

1. **Capture** - for each "ring" (a turntable pass at one camera elevation),
   either:
   - tap **Capture Video** to hand off to the phone's stock Camera app, then
     return to ForgeScan and **Import Video** to select what it produced, or
   - **Import Video** an existing recording directly from the system picker.

   Import auto-extracts up to 120 evenly-spaced frames. A single ring is
   enough to produce a model; a second ring at a different elevation
   substantially improves coverage of the top/underside and any overhanging
   features (see "Known limitations").
2. **Upload & Train (Cloud)** - zips the populated rings and POSTs them to
   the backend, which runs the full pipeline and trains a real Gaussian
   splat. Runs as a foreground service (`CloudUploadWorker.kt`) so it
   survives the app being backgrounded - a full run can take up to ~40
   minutes. A notification tracks progress and completion; the app itself
   also reflects status while in the foreground.
3. **View Splat** - once training completes, saved to `Downloads/ForgeScan`
   and viewable in-app via a bundled `GaussianSplats3D`-based WebView
   (`SplatViewerScreen.kt`) - drag to orbit, scroll to zoom.

## Cloud training (`BackendClient.kt`, `CloudUploadWorker.kt`)

Requires a `backend.properties` file at the repo root (gitignored, same
pattern as `keystore.properties`):

```properties
apiKey=<value from `modal secret create forgescan-api-key API_KEY=...`>
splatEndpointUrl=<the process_scan_splat_endpoint URL from `modal deploy`>
```

Without it, the button is present but fails immediately with a clear error
rather than posting to a blank URL. The backend has no job queue/status
endpoint yet, so this is a single long-running synchronous HTTP call, not
polled job status - `CloudUploadWorker.kt`'s foreground-service wrapping is
what makes that survivable rather than the network call itself being
resumable.

## Splat preview (`SplatViewerScreen.kt`, `assets/splat_viewer.html`)

Wraps the same `GaussianSplats3D`-based viewer validated against real trained
splats in a desktop browser, rather than a native Gaussian-splat renderer
(which would mean reimplementing anisotropic ellipsoid rendering, depth
sorting, and spherical-harmonic shading by hand in OpenGL/Vulkan). The `.ply`
is served to the WebView through a `WebViewAssetLoader` PathHandler over a
virtual `https://appassets.androidplatform.net/` origin - not a raw `file://`
URL (blocked by default on modern WebView) and not a JS-bridge byte transfer
(memory-prohibitive for a splat file this size - these have run 100-500MB in
testing).

## Retired: on-device visual-hull pipeline

Earlier versions of this app reconstructed a mesh entirely on-device
(silhouette voxel carving, no cloud/AI dependency) behind a "Process" button.
That path is retired now that cloud training is proven end-to-end - the
source (`ReconstructionPipeline.kt`, `BackgroundRemoval.kt`, `TurntableSfm.kt`,
`VoxelCarver.kt`, `VoxelMesher.kt`, `MeshColorizer.kt`, `GlbWriter.kt`,
`ObjWriter.kt`, `MeshPreviewScreen.kt`, `GaussianSplatExporter.kt`) is still
in the repo but no longer wired to any UI element, and may be deleted in a
future pass.

## Build

```bash
./gradlew :app:installDebug
```

Requires a connected device/emulator (`adb devices`).

## Repo layout note

Only `:app` (this Kotlin/Compose module) is listed in `settings.gradle.kts`
and actively built. `native/`, `docs/`, and the root-level `assets/` predate
a full rewrite (see git history: "Rewrite ForgeScan Mobile as native
Kotlin/Compose visual-hull pipeline") away from an older React Native/Expo +
Gaussian-Splatting architecture, and aren't referenced by the current build -
`docs/` in particular describes that old design, not this one.

## Known limitations

- A single elevation ring leaves the top/underside and any overhanging
  features (e.g. a handle) poorly covered - confirmed independently on both
  the old on-device pipeline and the cloud path (a thermos test capture's
  handle came out as consistent geometric noise from every viewing angle,
  the signature of a coverage gap rather than a training artifact). A second
  ring at a different elevation is the real fix, not further training-time
  tuning.
- The cloud path is a single long-running HTTP call with no job queue to
  reconnect to - if `CloudUploadWorker.kt`'s foreground service itself gets
  killed (not just the app backgrounded), the run is lost and must be
  restarted from Capture.
- `backend.properties`'s API key is a single static shared secret, not
  per-user auth - fine for this stage, not for a multi-user product.
