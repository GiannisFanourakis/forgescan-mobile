package com.forgescan.mobile

import kotlin.math.sqrt

// Smoothed, welded geometry plus the original per-face corner grouping,
// still expressed as welded-vertex indices. Geometry (position/normal
// smoothing) needs vertices shared across adjacent faces to average
// correctly; texture baking (TextureBaker.kt) needs the opposite - each
// face's own independent set of 4 corners, since a UV atlas gives every face
// its own tile and a shared vertex can't carry two different UVs at once.
// Keeping both derived from the same welded/smoothed arrays means texture
// baking never has to re-derive or approximate the smoothed geometry.
internal class RawMesh(
    val weldedPositions: FloatArray,
    val weldedNormals: FloatArray,
    val faces: List<IntArray>,
)

// Builds a mesh from the carved occupancy grid using exposed-face quads (a
// face is emitted wherever an occupied voxel borders an empty one), then
// applies Laplacian smoothing to soften the resulting blocky look. This is
// deliberately simpler than full marching cubes: marching cubes' 256-case
// triangulation table is easy to get subtly wrong without a reference to
// validate against on real data, while exposed-face meshing is trivially
// correct for any binary occupancy field. It can be upgraded to true marching
// cubes later once there's known-good captured data to validate against.
internal fun meshFromVoxelGrid(grid: VoxelGrid): RawMesh {
    val size = grid.size
    val half = size / 2f
    val voxelSize = 1f / half
    val positions = ArrayList<Float>()
    val rawFaces = ArrayList<IntArray>()

    fun world(gx: Int, gy: Int, gz: Int): FloatArray =
        floatArrayOf((gx - half) / half, (gy - half) / half, (gz - half) / half)

    fun addFace(corners: List<FloatArray>) {
        val start = positions.size / 3
        corners.forEach { c -> positions += c[0]; positions += c[1]; positions += c[2] }
        rawFaces += intArrayOf(start, start + 1, start + 2, start + 3)
    }

    for (x in 0 until size) {
        for (y in 0 until size) {
            for (z in 0 until size) {
                if (!grid.isOccupied(x, y, z)) continue
                if (!grid.isOccupied(x + 1, y, z)) {
                    val (px, py, pz) = world(x + 1, y, z).let { Triple(it[0], it[1], it[2]) }
                    addFace(
                        listOf(
                            floatArrayOf(px, py, pz),
                            floatArrayOf(px, py + voxelSize, pz),
                            floatArrayOf(px, py + voxelSize, pz + voxelSize),
                            floatArrayOf(px, py, pz + voxelSize),
                        ),
                    )
                }
                if (!grid.isOccupied(x - 1, y, z)) {
                    val (px, py, pz) = world(x, y, z).let { Triple(it[0], it[1], it[2]) }
                    addFace(
                        listOf(
                            floatArrayOf(px, py, pz + voxelSize),
                            floatArrayOf(px, py + voxelSize, pz + voxelSize),
                            floatArrayOf(px, py + voxelSize, pz),
                            floatArrayOf(px, py, pz),
                        ),
                    )
                }
                if (!grid.isOccupied(x, y + 1, z)) {
                    val (px, py, pz) = world(x, y + 1, z).let { Triple(it[0], it[1], it[2]) }
                    addFace(
                        listOf(
                            floatArrayOf(px, py, pz),
                            floatArrayOf(px, py, pz + voxelSize),
                            floatArrayOf(px + voxelSize, py, pz + voxelSize),
                            floatArrayOf(px + voxelSize, py, pz),
                        ),
                    )
                }
                if (!grid.isOccupied(x, y - 1, z)) {
                    val (px, py, pz) = world(x, y, z).let { Triple(it[0], it[1], it[2]) }
                    addFace(
                        listOf(
                            floatArrayOf(px + voxelSize, py, pz),
                            floatArrayOf(px + voxelSize, py, pz + voxelSize),
                            floatArrayOf(px, py, pz + voxelSize),
                            floatArrayOf(px, py, pz),
                        ),
                    )
                }
                if (!grid.isOccupied(x, y, z + 1)) {
                    val (px, py, pz) = world(x, y, z + 1).let { Triple(it[0], it[1], it[2]) }
                    addFace(
                        listOf(
                            floatArrayOf(px, py, pz),
                            floatArrayOf(px + voxelSize, py, pz),
                            floatArrayOf(px + voxelSize, py + voxelSize, pz),
                            floatArrayOf(px, py + voxelSize, pz),
                        ),
                    )
                }
                if (!grid.isOccupied(x, y, z - 1)) {
                    val (px, py, pz) = world(x, y, z).let { Triple(it[0], it[1], it[2]) }
                    addFace(
                        listOf(
                            floatArrayOf(px, py + voxelSize, pz),
                            floatArrayOf(px + voxelSize, py + voxelSize, pz),
                            floatArrayOf(px + voxelSize, py, pz),
                            floatArrayOf(px, py, pz),
                        ),
                    )
                }
            }
        }
    }

    val rawIndices = IntArray(rawFaces.size * 6)
    for (i in rawFaces.indices) {
        val f = rawFaces[i]
        val base = i * 6
        rawIndices[base] = f[0]; rawIndices[base + 1] = f[1]; rawIndices[base + 2] = f[2]
        rawIndices[base + 3] = f[0]; rawIndices[base + 4] = f[2]; rawIndices[base + 5] = f[3]
    }

    val (weldedPositions, remap, weldedIndices) = weldVertices(positions.toFloatArray(), rawIndices, voxelSize)
    val smoothed = smoothPositions(weldedPositions, weldedIndices, iterations = 12)
    val normals = recomputeNormals(smoothed, weldedIndices)
    val weldedFaces = rawFaces.map { face -> IntArray(4) { c -> remap[face[c]] } }
    return RawMesh(smoothed, normals, weldedFaces)
}

// Every exposed face is emitted with 4 brand-new vertices, even where it
// shares an edge with the adjacent exposed face at the exact same position -
// left un-welded, each quad is its own disconnected 4-vertex island. Smoothing
// an isolated island only ever averages a vertex against the other corners of
// its own tiny quad, which collapses each one toward its own centroid rather
// than spreading it across the real surface, leaving a field of shrunken
// fragments instead of a connected mesh. Welding coincident corners first
// (they sit on the exact same voxel-grid lattice, so equality after rounding
// is exact, not approximate) gives smoothing a real neighbor graph that spans
// across adjacent faces. The remap array is returned too so callers can map
// their own per-face raw-vertex groupings onto the same welded indices
// without redoing the spatial lookup.
private fun weldVertices(positions: FloatArray, indices: IntArray, voxelSize: Float): Triple<FloatArray, IntArray, IntArray> {
    val tolerance = voxelSize * 0.01f
    val cellSize = maxOf(tolerance, 1e-6f)
    fun key(x: Float, y: Float, z: Float): Long {
        val kx = Math.round(x / cellSize).toLong()
        val ky = Math.round(y / cellSize).toLong()
        val kz = Math.round(z / cellSize).toLong()
        return (kx and 0x1FFFFF) or ((ky and 0x1FFFFF) shl 21) or ((kz and 0x1FFFFF) shl 42)
    }

    val vertexCount = positions.size / 3
    val remap = IntArray(vertexCount)
    val canonicalIndexOf = HashMap<Long, Int>()
    val weldedPositions = ArrayList<Float>()
    for (v in 0 until vertexCount) {
        val x = positions[v * 3]
        val y = positions[v * 3 + 1]
        val z = positions[v * 3 + 2]
        val k = key(x, y, z)
        val existing = canonicalIndexOf[k]
        if (existing != null) {
            remap[v] = existing
        } else {
            val newIndex = weldedPositions.size / 3
            weldedPositions += x; weldedPositions += y; weldedPositions += z
            canonicalIndexOf[k] = newIndex
            remap[v] = newIndex
        }
    }
    val weldedIndices = IntArray(indices.size) { i -> remap[indices[i]] }
    return Triple(weldedPositions.toFloatArray(), remap, weldedIndices)
}

// Taubin (lambda|mu) smoothing: alternating a "shrink" pass (positive factor)
// with a stronger "inflate" pass (negative factor) cancels out the net volume
// loss that plain repeated Laplacian averaging causes, while still washing
// out the high-frequency voxel-grid terracing. Plain Laplacian needed to stay
// weak (a 50/50 blend, few iterations) specifically to avoid visible
// shrinkage - Taubin removes that trade-off, so it can run enough passes to
// actually erase the terracing instead of just softening its edges.
private fun smoothPositions(positions: FloatArray, indices: IntArray, iterations: Int): FloatArray {
    val vertexCount = positions.size / 3
    val neighbors = Array(vertexCount) { mutableSetOf<Int>() }
    var i = 0
    while (i < indices.size) {
        val a = indices[i]
        val b = indices[i + 1]
        val c = indices[i + 2]
        neighbors[a] += b; neighbors[a] += c
        neighbors[b] += a; neighbors[b] += c
        neighbors[c] += a; neighbors[c] += b
        i += 3
    }
    val lambda = 0.5f
    val mu = -0.53f
    var current = positions.copyOf()
    repeat(iterations) {
        current = laplacianPass(current, neighbors, lambda)
        current = laplacianPass(current, neighbors, mu)
    }
    return current
}

private fun laplacianPass(positions: FloatArray, neighbors: Array<MutableSet<Int>>, factor: Float): FloatArray {
    val vertexCount = positions.size / 3
    val next = positions.copyOf()
    for (v in 0 until vertexCount) {
        val n = neighbors[v]
        if (n.isEmpty()) continue
        var sx = 0f
        var sy = 0f
        var sz = 0f
        for (nb in n) {
            sx += positions[nb * 3]; sy += positions[nb * 3 + 1]; sz += positions[nb * 3 + 2]
        }
        val count = n.size
        val cx = sx / count
        val cy = sy / count
        val cz = sz / count
        next[v * 3] = positions[v * 3] + factor * (cx - positions[v * 3])
        next[v * 3 + 1] = positions[v * 3 + 1] + factor * (cy - positions[v * 3 + 1])
        next[v * 3 + 2] = positions[v * 3 + 2] + factor * (cz - positions[v * 3 + 2])
    }
    return next
}

private fun recomputeNormals(positions: FloatArray, indices: IntArray): FloatArray {
    val normals = FloatArray(positions.size)
    var i = 0
    while (i < indices.size) {
        val ia = indices[i] * 3
        val ib = indices[i + 1] * 3
        val ic = indices[i + 2] * 3
        val ax = positions[ia]; val ay = positions[ia + 1]; val az = positions[ia + 2]
        val bx = positions[ib]; val by = positions[ib + 1]; val bz = positions[ib + 2]
        val cx = positions[ic]; val cy = positions[ic + 1]; val cz = positions[ic + 2]
        val ux = bx - ax; val uy = by - ay; val uz = bz - az
        val vx = cx - ax; val vy = cy - ay; val vz = cz - az
        val nx = uy * vz - uz * vy
        val ny = uz * vx - ux * vz
        val nz = ux * vy - uy * vx
        normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz
        normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz
        normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz
        i += 3
    }
    val vertexCount = positions.size / 3
    for (v in 0 until vertexCount) {
        val x = normals[v * 3]; val y = normals[v * 3 + 1]; val z = normals[v * 3 + 2]
        val len = sqrt(x * x + y * y + z * z)
        if (len > 1e-6f) {
            normals[v * 3] = x / len; normals[v * 3 + 1] = y / len; normals[v * 3 + 2] = z / len
        }
    }
    return normals
}
