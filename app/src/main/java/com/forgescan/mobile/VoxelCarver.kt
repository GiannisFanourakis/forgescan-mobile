package com.forgescan.mobile

import android.util.Log
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
// neighbors): keeps the largest connected group of occupied voxels, plus any
// other component within bridgeRadius voxels of it, and drops the rest.
// Carving noise - a stray voxel cluster that happened to agree across every
// tested silhouette by coincidence - forms its own small component far from
// the real object, so it's still dropped. But a real attachment - a handle's
// mounting point carved slightly imprecisely - can end up a couple of voxels
// short of actually touching the body even at 26-connectivity (confirmed via
// logging on a real capture: a real handle came back as its own 1467-voxel
// component, 0.10% of the total occupied volume, entirely separate from the
// 99.90% main body - "keep only the literal largest" deleted it outright).
// Proximity bridging keeps a real nearby feature like that while still
// dropping true noise that ends up far from the main body.
internal fun keepLargestComponent(grid: VoxelGrid, bridgeRadius: Int = 2): VoxelGrid {
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
    val top5 = componentSizes.withIndex().sortedByDescending { it.value }.take(5)
        .joinToString { "${it.value}(${(it.value * 100.0 / componentSizes.sum()).let { p -> "%.2f".format(p) }}%)" }
    Log.d("ForgeScan", "keepLargestComponent: ${componentSizes.size} components, top5 sizes: $top5")

    run {
        val minX = IntArray(componentSizes.size) { size }; val maxX = IntArray(componentSizes.size) { -1 }
        val minY = IntArray(componentSizes.size) { size }; val maxY = IntArray(componentSizes.size) { -1 }
        val minZ = IntArray(componentSizes.size) { size }; val maxZ = IntArray(componentSizes.size) { -1 }
        for (idx in 0 until total) {
            val label = labels[idx]
            if (label == -1) continue
            val x = idx % size; val y = (idx / size) % size; val z = idx / (size * size)
            if (x < minX[label]) minX[label] = x; if (x > maxX[label]) maxX[label] = x
            if (y < minY[label]) minY[label] = y; if (y > maxY[label]) maxY[label] = y
            if (z < minZ[label]) minZ[label] = z; if (z > maxZ[label]) maxZ[label] = z
        }
        val bboxes = componentSizes.indices.sortedByDescending { componentSizes[it] }.take(5).joinToString(" | ") { l ->
            "${componentSizes[l]}voxels: x[${minX[l]}..${maxX[l]}] y[${minY[l]}..${maxY[l]}] z[${minZ[l]}..${maxZ[l]}]"
        }
        Log.d("ForgeScan", "keepLargestComponent: bboxes: $bboxes")
    }

    if (componentSizes.size > 1) {
        var probe = BooleanArray(total) { labels[it] == largestLabel }
        val remaining = (0 until componentSizes.size).filterTo(HashSet()) { it != largestLabel }
        val foundAtPass = HashMap<Int, Int>()
        var pass = 0
        while (remaining.isNotEmpty() && pass < 8) {
            pass++
            probe = dilateGridOnce(probe, size)
            val touched = HashSet<Int>()
            for (idx in 0 until total) {
                val label = labels[idx]
                if (label != -1 && label in remaining && probe[idx]) touched += label
            }
            for (label in touched) {
                foundAtPass[label] = pass
                remaining.remove(label)
            }
        }
        Log.d("ForgeScan", "keepLargestComponent: bridge distance (passes to touch main body) by component size: " +
            foundAtPass.entries.joinToString { "${componentSizes[it.key]}voxels@${it.value}" } +
            if (remaining.isNotEmpty()) "; unreached within 8 passes: ${remaining.map { componentSizes[it] }}" else "")
    }

    var proximity = BooleanArray(total) { labels[it] == largestLabel }
    repeat(bridgeRadius) { proximity = dilateGridOnce(proximity, size) }

    val keepLabel = BooleanArray(componentSizes.size)
    keepLabel[largestLabel] = true
    for (idx in 0 until total) {
        val label = labels[idx]
        if (label != -1 && !keepLabel[label] && proximity[idx]) keepLabel[label] = true
    }
    val keptCount = keepLabel.count { it }
    Log.d("ForgeScan", "keepLargestComponent: bridged in ${keptCount - 1} nearby component(s) at radius $bridgeRadius")

    val filtered = BooleanArray(total) { labels[it] != -1 && keepLabel[labels[it]] }
    return VoxelGrid(size, filtered)
}

private fun dilateGridOnce(source: BooleanArray, size: Int): BooleanArray {
    val next = BooleanArray(source.size)
    for (z in 0 until size) {
        for (y in 0 until size) {
            for (x in 0 until size) {
                val idx = (z * size + y) * size + x
                if (source[idx]) {
                    next[idx] = true
                    continue
                }
                var hit = false
                loop@ for (dz in -1..1) {
                    for (dy in -1..1) {
                        for (dx in -1..1) {
                            if (dx == 0 && dy == 0 && dz == 0) continue
                            val nx = x + dx
                            val ny = y + dy
                            val nz = z + dz
                            if (nx < 0 || ny < 0 || nz < 0 || nx >= size || ny >= size || nz >= size) continue
                            if (source[(nz * size + ny) * size + nx]) {
                                hit = true
                                break@loop
                            }
                        }
                    }
                }
                next[idx] = hit
            }
        }
    }
    return next
}

// A turntable plate directly beneath the object sits in every frame's
// silhouette (see BackgroundRemoval.kt's imperfect turntable-exclusion
// heuristic), so it carves as one continuous solid fused to the object's true
// bottom - much wider than the object itself, and there is nothing anywhere
// in the pipeline that marks a boundary between them (confirmed visually:
// the object's own color bleeds onto the disk's surface during texturing,
// since a face there gets colored the same way as any other face - by
// normal-weighted photo blending - with no notion that it's geometrically
// "disk" rather than "object"). Left in, meshFromVoxelGrid's Taubin smoothing
// then rounds the corner between them into one continuous fillet, reading as
// the object melting into a puddle rather than sitting on a separate disk.
//
// A pure carved-shape guess at where the disk ends (the first version of
// this, and radius-profile-only fallback below) has no ground truth to check
// against, and silently trades one failure for another - clearing whole
// layers lost real body height (confirmed: the resulting model was shorter
// than the real object), while clearing only radially-excess voxels avoids
// that but can't ever be *sure* it found the right boundary, only a
// plausible one.
//
// heightToBodyRadius (from TurntableSfm.kt) is real ground truth instead of a
// guess: it's the object's own true height-to-radius ratio, measured from
// triangulated ORB feature points, which land almost entirely on the
// textured object rather than the blank turntable plate - so it reflects the
// real object's shape, independent of where carving fused the disk on. Given
// that ratio and the body radius already measured from the grid, the true
// bottom is a direct calculation (maxY - ratio * bodyRadius), not a guess -
// everything below it is confidently disk and gets fully cleared. Above that
// line, radial clipping still runs as a second pass, since the disk's wide
// equator can extend upward past the true bottom into Y layers the object
// itself also occupies. Without a measurement (OpenCV/feature-matching
// unavailable), this falls back to radial clipping across the whole lower
// half, same as before.
internal fun stripTurntableBase(grid: VoxelGrid, heightToBodyRadius: Float? = null, flareRatio: Float = 1.3f): VoxelGrid {
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
    val step = maxOf(1, (midY - minY) / 20)
    Log.d("ForgeScan", "stripTurntableBase: minY=$minY maxY=$maxY midY=$midY bodyRadius=$bodyRadius " +
        "radiusProfile(step=$step)=" + (minY..midY step step).joinToString { y -> "%.1f".format(layerMaxRadius(y)) })
    if (bodyRadius <= 0f) return grid

    val measuredMinY = heightToBodyRadius?.let { ratio ->
        (maxY - (ratio * bodyRadius)).toInt().coerceIn(minY, midY)
    }
    Log.d("ForgeScan", "stripTurntableBase: heightToBodyRadius=$heightToBodyRadius measuredMinY=$measuredMinY")

    val occupied = grid.occupied.copyOf()
    var fullyCleared = 0
    if (measuredMinY != null && measuredMinY > minY) {
        for (y in minY until measuredMinY) {
            for (zi in 0 until size) {
                for (xi in 0 until size) {
                    if (occupied[(zi * size + y) * size + xi]) {
                        occupied[(zi * size + y) * size + xi] = false
                        fullyCleared++
                    }
                }
            }
        }
    }

    // Above the measured true bottom (or across the whole lower half if there
    // was no measurement to trust), the disk's wide equator can still bleed
    // into Y layers the object's own real body also occupies, so voxels are
    // only cleared if they stick out past the body's own radius - not every
    // voxel at that height - leaving the object's real lower body untouched.
    var radiallyCleared = 0
    val occupiedGrid = VoxelGrid(size, occupied)
    val thresholdSq = (bodyRadius * flareRatio) * (bodyRadius * flareRatio)
    val radialScanStart = measuredMinY ?: minY
    for (y in radialScanStart until midY) {
        for (zi in 0 until size) {
            for (xi in 0 until size) {
                if (!occupiedGrid.isOccupied(xi, y, zi)) continue
                val dx = xi - center
                val dz = zi - center
                if (dx * dx + dz * dz > thresholdSq) {
                    occupied[(zi * size + y) * size + xi] = false
                    radiallyCleared++
                }
            }
        }
    }
    Log.d("ForgeScan", "stripTurntableBase: fully cleared $fullyCleared voxels below measured bottom, " +
        "radially cleared $radiallyCleared voxels above it (bodyRadius=$bodyRadius, threshold=${bodyRadius * flareRatio})")
    return VoxelGrid(size, occupied)
}

