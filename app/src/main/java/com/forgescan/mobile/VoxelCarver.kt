package com.forgescan.mobile

import kotlin.math.sqrt

// Higher resolution directly reduces the blocky/terraced look on curved
// surfaces (a cylinder's side wall approximated by a 128-wide grid has
// visibly large steps between voxel layers, which Taubin smoothing softens
// but can't fully erase without eating real detail). 192^3 is ~3.4x the
// voxel count of the previous 128^3, so carving takes proportionally longer,
// but this runs once per "Process" tap in the background with progress
// reporting already wired up, not on a latency-sensitive path.
internal const val VoxelGridSize = 192

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
    agreementThreshold: Float = 1f,
): VoxelGrid {
    val totalTests = rings.sumOf { it.projections.size }
    val minPassing = (totalTests * agreementThreshold).toInt()
    val occupied = BooleanArray(gridSize * gridSize * gridSize)
    val half = gridSize / 2f
    for (xi in 0 until gridSize) {
        val x = (xi - half) / half
        for (yi in 0 until gridSize) {
            val y = (yi - half) / half
            for (zi in 0 until gridSize) {
                val z = (zi - half) / half
                var passCount = 0
                var remaining = totalTests
                loop@ for (ring in rings) {
                    for (frameIndex in ring.projections.indices) {
                        if (sampleSilhouette(ring, frameIndex, x, y, z)) passCount++
                        remaining--
                        // Early exit once the outcome is decided either way -
                        // either enough tests have already passed, or not
                        // enough remain to possibly reach the threshold.
                        if (passCount >= minPassing || passCount + remaining < minPassing) break@loop
                    }
                }
                if (passCount >= minPassing) occupied[(zi * gridSize + yi) * gridSize + xi] = true
            }
        }
        onProgress(xi + 1, gridSize)
    }
    return VoxelGrid(gridSize, occupied)
}

// Connected-component filter (26-connectivity, i.e. including diagonal
// neighbors): keeps only the single largest connected group of occupied
// voxels and drops every other component. Carving noise - a stray voxel
// cluster that happened to agree across every tested silhouette by
// coincidence - forms its own small component disconnected from the real
// object, so dropping everything but the largest component removes it
// cleanly. Unlike morphological erosion (the previous approach here), this
// never touches genuine thin features - a handle, a spout - as long as they
// stay physically attached to the main body. 26-connectivity (rather than
// just the 6 face neighbors) tolerates a bridge that only touches the main
// body diagonally, which a thin handle attachment carved slightly
// imprecisely is prone to - a strict 6-connectivity bridge is easy to sever
// by a single voxel's worth of carving error.
internal fun keepLargestComponent(grid: VoxelGrid): VoxelGrid {
    val size = grid.size
    val total = size * size * size
    val labels = IntArray(total) { -1 }
    val stack = IntArray(total)

    fun tryPush(x: Int, y: Int, z: Int, label: Int, top: Int): Int {
        if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size) return top
        val idx = (z * size + y) * size + x
        if (labels[idx] != -1 || !grid.isOccupied(x, y, z)) return top
        labels[idx] = label
        stack[top] = idx
        return top + 1
    }

    val componentSizes = ArrayList<Int>()
    for (start in 0 until total) {
        if (labels[start] != -1) continue
        val sx = start % size
        val sy = (start / size) % size
        val sz = start / (size * size)
        if (!grid.isOccupied(sx, sy, sz)) continue

        val label = componentSizes.size
        var top = 0
        labels[start] = label
        stack[top++] = start
        var count = 0
        while (top > 0) {
            val idx = stack[--top]
            count++
            val x = idx % size
            val y = (idx / size) % size
            val z = idx / (size * size)
            for (dx in -1..1) {
                for (dy in -1..1) {
                    for (dz in -1..1) {
                        if (dx == 0 && dy == 0 && dz == 0) continue
                        top = tryPush(x + dx, y + dy, z + dz, label, top)
                    }
                }
            }
        }
        componentSizes += count
    }

    if (componentSizes.isEmpty()) return grid
    var largestLabel = 0
    var largestSize = componentSizes[0]
    for (i in 1 until componentSizes.size) {
        if (componentSizes[i] > largestSize) {
            largestSize = componentSizes[i]
            largestLabel = i
        }
    }
    val filtered = BooleanArray(total) { labels[it] == largestLabel }
    return VoxelGrid(size, filtered)
}

// Corrects the carved shape's top/bottom using photogrammetry-measured cap-
// to-body radius ratios (see estimateRingCapRadiusFractions in
// TurntableSfm.kt). A single-elevation ring's silhouette cones can't
// distinguish a flat lid/base from a rounded one - every ray grazes the cap
// at the same shallow angle regardless of the real shape - so carving alone
// tapers to a point there no matter what the object actually looks like. The
// measured ratio comes from triangulated feature points instead of
// silhouettes, so it reflects the real cap width; voxels within that
// measured radius get force-filled across the taper zone rather than left to
// silhouette carving's unconstrained default.
internal fun flattenCaps(grid: VoxelGrid, topFraction: Float?, bottomFraction: Float?): VoxelGrid {
    if (topFraction == null && bottomFraction == null) return grid
    val size = grid.size
    val center = size / 2f

    var minY = -1
    var maxY = -1
    for (yi in 0 until size) {
        var any = false
        outer@ for (zi in 0 until size) {
            for (xi in 0 until size) {
                if (grid.isOccupied(xi, yi, zi)) {
                    any = true
                    break@outer
                }
            }
        }
        if (any) {
            if (minY == -1) minY = yi
            maxY = yi
        }
    }
    if (minY == -1 || maxY <= minY) return grid
    val midY = (minY + maxY) / 2

    fun layerMaxRadius(yi: Int): Float {
        var maxR = 0f
        for (zi in 0 until size) {
            for (xi in 0 until size) {
                if (!grid.isOccupied(xi, yi, zi)) continue
                val dx = xi - center
                val dz = zi - center
                val r = sqrt(dx * dx + dz * dz)
                if (r > maxR) maxR = r
            }
        }
        return maxR
    }

    val bodyRadius = layerMaxRadius(midY)
    if (bodyRadius <= 0f) return grid

    val occupied = grid.occupied.copyOf()
    fun stamp(targetRadius: Float, fromY: Int, toY: Int, step: Int) {
        val targetRadiusSq = targetRadius * targetRadius
        var yi = fromY
        while (if (step > 0) yi <= toY else yi >= toY) {
            for (zi in 0 until size) {
                for (xi in 0 until size) {
                    val dx = xi - center
                    val dz = zi - center
                    if (dx * dx + dz * dz <= targetRadiusSq) {
                        occupied[(zi * size + yi) * size + xi] = true
                    }
                }
            }
            yi += step
        }
    }

    if (topFraction != null) {
        var taperStart = maxY
        var yi = maxY
        while (yi > midY) {
            if (layerMaxRadius(yi) < bodyRadius * 0.8f) taperStart = yi else break
            yi--
        }
        stamp(bodyRadius * topFraction, taperStart, maxY, 1)
    }
    if (bottomFraction != null) {
        var taperStart = minY
        var yi = minY
        while (yi < midY) {
            if (layerMaxRadius(yi) < bodyRadius * 0.8f) taperStart = yi else break
            yi++
        }
        stamp(bodyRadius * bottomFraction, minY, taperStart, -1)
    }

    return VoxelGrid(size, occupied)
}
