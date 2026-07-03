# Handoff — Native Kotlin Rewrite (Paused for Reconstruction-Approach Decision)

## Where things stand (2026-07-04)

The old React Native/Expo app has been deleted (commit `496ebcf`, **local only — not pushed**). Kept: `native/` (the working Java/Kotlin camera, ARCore, ML Kit masking, and ksplat-optimizer engine modules), `docs/`, `assets/` (icons + the fallback TFLite masking model). No new Kotlin/Gradle project has been scaffolded yet — the rewrite is paused right at this point, pending the decision below.

`README.md` and `.gitignore` still describe the old RN/Expo app and haven't been rewritten for the Kotlin architecture yet — expect stale references there until the new scaffold lands.

## Blocking decision: splatting vs. visual hull

The rewrite was originally going to carry the existing Gaussian Splatting pipeline (`.ksplat` export) forward as-is into the new Kotlin app. That's now in question: the splat reconstruction quality wasn't satisfying, and before scaffolding anything, the direction needs to be decided — continue with splatting, or move to **visual hull** (shape-from-silhouette) reconstruction instead.

Why visual hull is on the table:

- It's not a new idea for this project. This roadmap's own "Improve Rough Reconstruction" section already describes exactly this: mask/silhouette bounds -> estimated volume -> layered turntable mesh -> texture projection (see `ROADMAP.md`). The old TS app even had a proxy version of this — `reconstruction/rough-model.obj` and `point-cloud.ply` per `ARCHITECTURE.md` — as a separate path from splatting, just never promoted to the primary path.
- It pairs with a parallel discussion happening in the sibling SpinForge360-Mobile project, where the user pushed back hard on continuing to invest in an HTML-based spin viewer as the export format and wants a real interactive 3D file (glb/obj) instead of video/HTML. Visual hull naturally exports to glTF/.glb or .obj; splatting's `.ksplat` needs a separate custom viewer to be usable at all.

What's at stake depending on which way this goes:

- **If splatting continues:** `native/android-ksplat-optimizer/KsplatOptimizerModule.kt` and `native/android/forgescan-engines/.../ForgeScanKsplatOptimizerModule.java` (1552 lines), plus `ForgeScanKsplatView`/`ForgeScanKsplatViewManager`, carry forward largely as-is into the new project.
- **If visual hull replaces it:** those ksplat modules likely get parked or removed, and new engine work is needed for voxel carving, marching cubes, UV texture projection, and glTF writing — none of which exists yet anywhere in `native/`. Either way, `ForgeScanNativeMaskingModule` (ML Kit masking) and the camera/ARCore capture modules (`ForgeScanAdvancedCameraModule`, `ForgeScanARCaptureModule`, `ForgeScanCameraXView`/`ForgeScanCameraXViewManager`) stay relevant, since both approaches need clean per-frame masks and steady turntable capture.
- A hybrid (splatting for a viewer-quality preview, visual hull for a downloadable/interactive export) is also on the table but adds real complexity — worth ruling in or out explicitly rather than drifting into it by default.

## Next step

Decide the reconstruction approach before writing any new Kotlin code. Since the dissatisfaction was about output quality rather than architecture, it's probably worth comparing on real captured data (even a quick non-native prototype/spike) rather than committing based on discussion alone. Once decided, scaffold a plain Kotlin/Compose Android project (matching SpinForge360-Mobile's Gradle/module structure — root `build.gradle.kts`, `settings.gradle.kts`, `app/` module) and migrate the relevant `native/` engine modules in, layer by layer, keeping only what the chosen approach needs.

## Loose ends

- Commit `496ebcf` (RN/Expo deletion) is local only — decide whether to push it now or hold until the new scaffold lands alongside it.
- `README.md` and `.gitignore` need rewriting once the new architecture is locked in.
