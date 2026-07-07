package com.forgescan.mobile

import android.content.Context

// Bundles the reconstructed mesh with the project as updated during the same
// pipeline run (currently just the freshly-detected ring groups) - the mesh
// preview and the ring-group export UI are two different screens fed by one
// "Process" tap, so both results need to reach MainActivity's state.
// carvedRingIds records exactly which rings' silhouettes were combined into
// `mesh` (the largest registered group, per the carving-group selection
// below) - GaussianSplatExporter.kt can only reuse this mesh as a GS seed
// cloud for an export request whose ring set matches this one exactly;
// otherwise no mesh exists in that export's own frame and it must fall back
// to its sparse SfM point cloud instead.
class ReconstructionResult(val mesh: ForgeScanMesh, val updatedProject: ForgeScanProject, val carvedRingIds: List<String>)

// The single automatic pipeline behind the "Process" button: mask every
// populated ring, carve a voxel grid from the resulting silhouettes, extract
// a mesh, and texture it - no manual steps in between.
suspend fun runReconstructionPipeline(
    context: Context,
    project: ForgeScanProject,
    onStatus: suspend (String) -> Unit = {},
    onProgress: suspend (completed: Int, total: Int) -> Unit = { _, _ -> },
): ReconstructionResult {
    val populatedRings = project.rings.filter { it.frames.isNotEmpty() }
    require(populatedRings.isNotEmpty()) { "Add frames to at least one ring first." }

    onStatus("Removing backgrounds...")
    for (ring in populatedRings) {
        maskRing(
            context,
            project,
            ring.ringId,
            onPreparing = { onStatus("Downloading background removal model...") },
            onProgress = onProgress,
        )
    }

    // Cross-ring registration (detectRingGroups) needs masks to exist for
    // every populated ring first, exactly like the geometry analysis right
    // below - so this rides the same Process pass instead of needing its own
    // separate user-facing "detect" step. Cheap to skip entirely when there's
    // only one populated ring (detectRingGroups short-circuits to singleton
    // groups without attempting any registration).
    onStatus("Checking for overlapping rings...")
    val detectedGroups = detectRingGroups(context, project)
    val updatedProject = project.withDetectedRingGroups(detectedGroups)
    saveProject(context, updatedProject)

    onStatus("Analyzing turntable geometry...")
    // Carving combines every ring it's given into one silhouette-cone
    // intersection, which silently assumes they all share the same
    // real-world azimuth zero-reference - true within one ring's own
    // frames, but never guaranteed across separately-captured rings.
    // Confirmed on a real two-ring capture this session: elevations
    // measured cleanly (1.3deg and 48.9deg), but registerRings could not
    // find a consistent relative phase between them - carving both anyway
    // intersected two misaligned cone sets and produced a small,
    // unrecognizable fragment instead of the object, since ~97% cross-frame
    // agreement across misaligned rings leaves almost nothing standing.
    // Only the largest detected group (by total frame count) is carved
    // together, each non-reference ring's azimuth corrected by its own
    // solved offset; rings outside that group are excluded from the carve
    // (they're still independently available for GS export via the
    // per-group export UI, which already handles registration failure the
    // same honest way - excluding a ring rather than guessing its offset).
    val carvingGroup = detectedGroups.maxByOrNull { group ->
        group.sumOf { id -> populatedRings.first { ring -> ring.ringId == id }.frames.size }
    } ?: emptyList()
    val carvingRings = carvingGroup.mapNotNull { id -> populatedRings.firstOrNull { it.ringId == id } }
    val carvingReference = carvingRings.firstOrNull()
    val azimuthOffsetDegrees = HashMap<String, Float>()
    if (carvingReference != null) {
        azimuthOffsetDegrees[carvingReference.ringId] = 0f
        val referenceElevation = (estimateRingElevationDegrees(context, project.projectId, carvingReference)
            ?: ringElevationFallbackDegrees(carvingReference.ringId)).toDouble()
        for (ring in carvingRings) {
            if (ring.ringId == carvingReference.ringId) continue
            val ringElevation = (estimateRingElevationDegrees(context, project.projectId, ring)
                ?: ringElevationFallbackDegrees(ring.ringId)).toDouble()
            val registration = registerRings(context, project.projectId, carvingReference, referenceElevation, ring, ringElevation)
            azimuthOffsetDegrees[ring.ringId] = (registration?.azimuthPhaseOffsetDegrees ?: 0.0).toFloat()
        }
    }
    val ringSilhouettes = carvingRings.mapNotNull { ring ->
        loadRingSilhouettes(context, project, ring, azimuthOffsetDegrees[ring.ringId] ?: 0f)
    }
    require(ringSilhouettes.isNotEmpty()) { "Masking did not produce usable silhouettes." }

    onStatus("Carving shape...")
    // Requiring literal unanimous agreement across every frame is fragile
    // for thin real features (a handle's silhouette failing in even one
    // frame - motion blur, anti-aliasing at a thin edge, mask downsampling -
    // carves it away entirely, independent of any downstream connectivity
    // filtering). Tolerating a small minority of disagreeing frames trades a
    // little carving precision for not losing genuine thin geometry to
    // occasional per-frame segmentation noise.
    val carvedGrid = carveVoxelGrid(ringSilhouettes, onProgress = onProgress, agreementThreshold = 0.97f)
    val filteredGrid = keepLargestComponent(carvedGrid)

    onStatus("Measuring cap geometry...")
    val capFractions = estimateCapRadiusFractions(context, project.projectId, populatedRings)
    val strippedGrid = stripTurntableBase(filteredGrid, capFractions?.heightToBodyRadius)
    val grid = flattenCaps(strippedGrid, capFractions?.top, capFractions?.bottom)

    onStatus("Building mesh...")
    val rawMesh = meshFromVoxelGrid(grid)

    onStatus("Applying texture...")
    val mesh = colorizeMesh(context, project, ringSilhouettes, rawMesh)
    return ReconstructionResult(mesh, updatedProject, carvingRings.map { it.ringId })
}
