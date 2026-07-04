package com.forgescan.mobile

import android.content.Context
import android.graphics.Bitmap
import kotlin.math.ceil

// Cap on how many frames from a single ring become texturing candidates.
// Adjacent frames in a dense turntable capture (often 100+ per ring) are only
// a few degrees apart and highly redundant for coloring purposes, so a
// strided subset keeps memory (each candidate holds a decoded bitmap) and
// per-vertex blending cost bounded without losing meaningful angular
// coverage.
private const val MaxCandidatesPerRing = 40

// V2 texturing: for every vertex, gather candidate views from every
// populated ring (not just the single largest ring), weight each by how
// face-on it is to the vertex's own normal - the dot product between the
// normal and that frame's synthetic camera direction - and blend the top few
// by that weight. This replaces a single-ring, nearest-azimuth "winner takes
// all" sampling that produced hard seams wherever neighboring vertices
// crossed a frame-selection boundary, and that could sample a poorly-suited
// ring for a vertex the biggest ring's camera barely saw face-on (e.g. the
// base, if only an upright ring happened to have the most frames). A vertex
// facing away from a given frame gets a low or negative weight, which also
// acts as a cheap stand-in for an occlusion test on a visual hull's
// roughly-convex geometry.
internal fun colorizeMesh(
    context: Context,
    project: ForgeScanProject,
    rings: List<RingSilhouettes>,
    mesh: ForgeScanMesh,
): ForgeScanMesh {
    class Candidate(
        val ring: RingSilhouettes,
        val projection: FrameProjection,
        val viewX: Float,
        val viewY: Float,
        val viewZ: Float,
        val bitmap: Bitmap,
    )

    val candidates = ArrayList<Candidate>()
    try {
        for (ringSilhouettes in rings) {
            val ring = project.rings.firstOrNull { it.ringId == ringSilhouettes.ringId } ?: continue
            val frameCount = ring.frames.size
            if (frameCount == 0) continue
            val stride = maxOf(1, ceil(frameCount / MaxCandidatesPerRing.toDouble()).toInt())
            var frameIndex = 0
            while (frameIndex < frameCount) {
                if (frameIndex < ringSilhouettes.projections.size) {
                    val projection = ringSilhouettes.projections[frameIndex]
                    // u and v are unit length and orthogonal (see
                    // loadRingSilhouettes), so their cross product is the third
                    // basis vector: the synthetic camera's toward-object axis.
                    val viewX = projection.uy * projection.vz - projection.uz * projection.vy
                    val viewY = projection.uz * projection.vx - projection.ux * projection.vz
                    val viewZ = projection.ux * projection.vy - projection.uy * projection.vx
                    val bitmap = openScaledFrameBitmap(context, ring.frames[frameIndex].uri, 512)
                    candidates += Candidate(ringSilhouettes, projection, viewX, viewY, viewZ, bitmap)
                }
                frameIndex += stride
            }
        }
        if (candidates.isEmpty()) return mesh

        val topK = minOf(4, candidates.size)
        val bestIndex = IntArray(topK)
        val bestWeight = FloatArray(topK)

        val colors = FloatArray(mesh.positions.size)
        val vertexCount = mesh.positions.size / 3
        for (v in 0 until vertexCount) {
            val x = mesh.positions[v * 3]
            val y = mesh.positions[v * 3 + 1]
            val z = mesh.positions[v * 3 + 2]
            val nx = mesh.normals[v * 3]
            val ny = mesh.normals[v * 3 + 1]
            val nz = mesh.normals[v * 3 + 2]

            for (k in 0 until topK) {
                bestIndex[k] = -1
                bestWeight[k] = -Float.MAX_VALUE
            }
            for (ci in candidates.indices) {
                val c = candidates[ci]
                val w = nx * c.viewX + ny * c.viewY + nz * c.viewZ
                var worst = 0
                for (k in 1 until topK) if (bestWeight[k] < bestWeight[worst]) worst = k
                if (w > bestWeight[worst]) {
                    bestWeight[worst] = w
                    bestIndex[worst] = ci
                }
            }

            var rSum = 0f
            var gSum = 0f
            var bSum = 0f
            var wSum = 0f
            for (k in 0 until topK) {
                val ci = bestIndex[k]
                if (ci < 0) continue
                // Floor the weight rather than dropping negative-weight
                // candidates outright: if every candidate faces away from
                // this vertex (possible on noisy normals after smoothing),
                // the least-bad view is still better than an uncolored gap.
                val w = maxOf(bestWeight[k], 1e-3f)
                val c = candidates[ci]
                val rawU = c.projection.ux * x + c.projection.uy * y + c.projection.uz * z
                val rawV = c.projection.vx * x + c.projection.vy * y + c.projection.vz * z
                val u = c.ring.centerU + rawU * c.ring.halfExtent
                val vCoord = c.ring.centerV + rawV * c.ring.halfExtent
                val bitmap = c.bitmap
                val px = (((u + 1f) * 0.5f) * bitmap.width).toInt().coerceIn(0, bitmap.width - 1)
                val py = (((1f - (vCoord + 1f) * 0.5f)) * bitmap.height).toInt().coerceIn(0, bitmap.height - 1)
                val pixel = bitmap.getPixel(px, py)
                rSum += ((pixel shr 16) and 0xFF) / 255f * w
                gSum += ((pixel shr 8) and 0xFF) / 255f * w
                bSum += (pixel and 0xFF) / 255f * w
                wSum += w
            }
            if (wSum > 0f) {
                colors[v * 3] = rSum / wSum
                colors[v * 3 + 1] = gSum / wSum
                colors[v * 3 + 2] = bSum / wSum
            } else {
                colors[v * 3] = 0.7f
                colors[v * 3 + 1] = 0.7f
                colors[v * 3 + 2] = 0.7f
            }
        }
        return mesh.copy(colors = colors)
    } finally {
        candidates.forEach { it.bitmap.recycle() }
    }
}

private fun openScaledFrameBitmap(context: Context, uriString: String, maxSide: Int): Bitmap {
    val bitmap = openFrameBitmap(context, uriString)
    val longest = maxOf(bitmap.width, bitmap.height)
    if (longest <= maxSide) return bitmap
    val scale = maxSide.toFloat() / longest
    val scaled = Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true)
    if (scaled !== bitmap) bitmap.recycle()
    return scaled
}
