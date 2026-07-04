package com.forgescan.mobile

internal const val VoxelGridSize = 128

internal class VoxelGrid(val size: Int, val occupied: BooleanArray) {
    fun isOccupied(x: Int, y: Int, z: Int): Boolean {
        if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size) return false
        return occupied[(z * size + y) * size + x]
    }
}

// Carves a dense voxel grid by silhouette-cone intersection: a voxel survives
// only if its canonical-space position projects inside every tested frame's
// silhouette, across every populated ring. At 128^3 with pre-downscaled
// (256x256) silhouettes this is comfortably CPU-tractable on-device; the
// per-voxel early exit on the first failing silhouette keeps the common case
// (most voxels are outside the object and fail quickly) well under the
// worst-case cost.
internal suspend fun carveVoxelGrid(
    rings: List<RingSilhouettes>,
    gridSize: Int = VoxelGridSize,
    onProgress: suspend (completed: Int, total: Int) -> Unit = { _, _ -> },
): VoxelGrid {
    val occupied = BooleanArray(gridSize * gridSize * gridSize)
    val half = gridSize / 2f
    for (xi in 0 until gridSize) {
        val x = (xi - half) / half
        for (yi in 0 until gridSize) {
            val y = (yi - half) / half
            for (zi in 0 until gridSize) {
                val z = (zi - half) / half
                var inside = true
                loop@ for (ring in rings) {
                    for (frameIndex in ring.projections.indices) {
                        if (!sampleSilhouette(ring, frameIndex, x, y, z)) {
                            inside = false
                            break@loop
                        }
                    }
                }
                if (inside) occupied[(zi * gridSize + yi) * gridSize + xi] = true
            }
        }
        onProgress(xi + 1, gridSize)
    }
    return VoxelGrid(gridSize, occupied)
}

// Morphological opening (erode then dilate, 6-connectivity): a voxel survives
// erosion only if it and all 6 face-neighbors are occupied, which clears any
// feature thinner than that - typically a stray voxel cluster from
// segmentation noise that happened to agree across every tested silhouette.
// Dilating the eroded grid back out restores the surviving bulk shape to
// roughly its original size, since erosion peeled off a 1-voxel shell
// everywhere, not just at the noise. Genuine thin real features (under ~2
// voxels wide at 128^3, i.e. under roughly 1.5% of the object's extent) would
// also be suppressed by this - an accepted trade-off for removing carving
// noise automatically.
internal fun openVoxelGrid(grid: VoxelGrid): VoxelGrid {
    val size = grid.size
    val eroded = BooleanArray(size * size * size)
    for (z in 0 until size) {
        for (y in 0 until size) {
            for (x in 0 until size) {
                if (!grid.isOccupied(x, y, z)) continue
                val survives = grid.isOccupied(x + 1, y, z) && grid.isOccupied(x - 1, y, z) &&
                    grid.isOccupied(x, y + 1, z) && grid.isOccupied(x, y - 1, z) &&
                    grid.isOccupied(x, y, z + 1) && grid.isOccupied(x, y, z - 1)
                if (survives) eroded[(z * size + y) * size + x] = true
            }
        }
    }
    val erodedGrid = VoxelGrid(size, eroded)
    val dilated = BooleanArray(size * size * size)
    for (z in 0 until size) {
        for (y in 0 until size) {
            for (x in 0 until size) {
                val restored = erodedGrid.isOccupied(x, y, z) ||
                    erodedGrid.isOccupied(x + 1, y, z) || erodedGrid.isOccupied(x - 1, y, z) ||
                    erodedGrid.isOccupied(x, y + 1, z) || erodedGrid.isOccupied(x, y - 1, z) ||
                    erodedGrid.isOccupied(x, y, z + 1) || erodedGrid.isOccupied(x, y, z - 1)
                if (restored) dilated[(z * size + y) * size + x] = true
            }
        }
    }
    return VoxelGrid(size, dilated)
}
