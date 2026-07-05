package com.forgescan.mobile

import android.content.Context

// The single automatic pipeline behind the "Process" button: mask every
// populated ring, carve a voxel grid from the resulting silhouettes, extract
// a mesh, and texture it - no manual steps in between.
suspend fun runReconstructionPipeline(
    context: Context,
    project: ForgeScanProject,
    onStatus: suspend (String) -> Unit = {},
    onProgress: suspend (completed: Int, total: Int) -> Unit = { _, _ -> },
): ForgeScanMesh {
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

    onStatus("Analyzing turntable geometry...")
    val ringSilhouettes = populatedRings.mapNotNull { loadRingSilhouettes(context, project, it) }
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
    val capFractions = estimateCapRadiusFractions(context, populatedRings)
    val grid = flattenCaps(filteredGrid, capFractions?.top, capFractions?.bottom)

    onStatus("Building mesh...")
    val rawMesh = meshFromVoxelGrid(grid)

    onStatus("Applying texture...")
    return colorizeMesh(context, project, ringSilhouettes, rawMesh)
}
