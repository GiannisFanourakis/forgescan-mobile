package com.forgescan.mobile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import kotlin.math.ceil
import kotlin.math.sqrt

// Cap on how many frames from a single ring become texturing candidates.
// Adjacent frames in a dense turntable capture (often 100+ per ring) are only
// a few degrees apart and highly redundant for coloring purposes, so a
// strided subset keeps memory (each candidate holds a decoded bitmap) and
// per-texel blending cost bounded without losing meaningful angular
// coverage.
private const val MaxCandidatesPerRing = 40

// Texels per face edge in the baked atlas, plus a gutter around each tile
// (the tile's own edge color, extended outward via clamped sampling) so GPU
// filtering at a face's UV border samples only that face's own content, not
// an unrelated neighboring face's tile. A prior texture-based attempt here
// (see GlbWriter.kt's history) used one texel per *vertex* with no spatial
// layout at all, which is what actually produced visible noise - this atlas
// gives every face its own coherent, padded block instead.
//
// The gutter needs to survive mipmap downsampling, not just base-level
// bilinear filtering: MeshPreviewScreen.kt generates a few mip levels so
// minification doesn't alias badly (disabling mipmaps entirely was tried
// first and produced severe moire instead - no middle ground at 1 texel).
// Each mip halving needs its own texel of safety margin against bleeding
// into the neighboring tile, so a 3-texel gutter keeps roughly the first
// couple of mip levels clean.
private const val TileSize = 8
private const val TileGutter = 3
private const val CellSize = TileSize + TileGutter * 2

// V2 texturing: for every baked texel, gather candidate views from every
// populated ring (not just the single largest ring), weight each by how
// face-on it is to that texel's own face normal - the dot product between
// the normal and that frame's synthetic camera direction - and blend the top
// few by that weight. This replaces a single-ring, nearest-azimuth
// "winner-takes-all" sampling that produced hard seams wherever neighboring
// texels crossed a frame-selection boundary, and that could sample a
// poorly-suited ring for a face the biggest ring's camera barely saw face-on
// (e.g. the base, if only an upright ring happened to have the most frames).
// A texel facing away from a given frame gets a low or negative weight,
// which also acts as a cheap stand-in for an occlusion test on a visual
// hull's roughly-convex geometry.
internal fun colorizeMesh(
    context: Context,
    project: ForgeScanProject,
    rings: List<RingSilhouettes>,
    mesh: RawMesh,
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

        val topK = minOf(4, candidates.size)
        val bestIndex = IntArray(maxOf(topK, 1))
        val bestWeight = FloatArray(maxOf(topK, 1))

        fun sampleColor(x: Float, y: Float, z: Float, nx: Float, ny: Float, nz: Float): FloatArray {
            for (k in 0 until topK) {
                bestIndex[k] = -1
                bestWeight[k] = -Float.MAX_VALUE
            }
            for (ci in candidates.indices) {
                val c = candidates[ci]
                val w = nx * c.viewX + ny * c.viewY + nz * c.viewZ
                var worst = 0
                for (k in 1 until topK) if (bestWeight[k] < bestWeight[worst]) worst = k
                if (topK > 0 && w > bestWeight[worst]) {
                    bestWeight[worst] = w
                    bestIndex[worst] = ci
                }
            }
            // A face with no genuinely face-on view (e.g. the underside of a
            // wide, near-horizontal cap a single-elevation ring can't see
            // into) doesn't just get a slightly-off sample - projecting
            // through a near-grazing view this far off-axis routinely lands
            // outside the object's own silhouette in that frame entirely,
            // sampling whatever background happens to be there. Below this
            // weight, prefer a flat neutral color over sampling at all,
            // rather than blending in that background pixel.
            val strongestWeight = (0 until topK).maxOfOrNull { bestWeight[it] } ?: -Float.MAX_VALUE
            if (strongestWeight < 0.2f) return floatArrayOf(0.6f, 0.6f, 0.6f)

            var rSum = 0f
            var gSum = 0f
            var bSum = 0f
            var wSum = 0f
            for (k in 0 until topK) {
                val ci = bestIndex[k]
                if (ci < 0) continue
                // Floor the weight rather than dropping negative-weight
                // candidates outright: if every candidate faces away from
                // this texel (possible on noisy normals after smoothing),
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
            return if (wSum > 0f) {
                floatArrayOf(rSum / wSum, gSum / wSum, bSum / wSum)
            } else {
                floatArrayOf(0.6f, 0.6f, 0.6f)
            }
        }

        val faceCount = mesh.faces.size
        val tilesPerRow = maxOf(1, ceil(sqrt(faceCount.toDouble())).toInt())
        val atlasSize = tilesPerRow * CellSize
        val atlasPixels = IntArray(atlasSize * atlasSize) { Color.rgb(179, 179, 179) }

        val positions = FloatArray(faceCount * 4 * 3)
        val normals = FloatArray(faceCount * 4 * 3)
        val uvs = FloatArray(faceCount * 4 * 2)
        val colors = FloatArray(faceCount * 4 * 3)
        val indices = IntArray(faceCount * 6)

        // The atlas (baked below, per-face) is the real texture and is what
        // the OBJ export uses - it can afford one independent sample per
        // face since every face gets its own tile. COLOR_0 vertex color
        // (what the in-app GLB preview actually renders - see GlbWriter.kt)
        // has no such luxury: two triangles sharing an edge only look
        // continuous if they agree on that shared vertex's color exactly,
        // not just approximately. Sampling independently per face (as the
        // atlas does) let neighboring faces pick slightly different best
        // views or land on slightly different texels, which is exactly the
        // speckled/mosaic look COLOR_0 rendering showed. Averaging every
        // face's corner sample across all faces that share that welded
        // vertex - the same welding VoxelMesher.kt already did for position/
        // normal - forces neighbors to agree, so GPU color interpolation
        // actually looks like a smooth gradient instead of a patchwork.
        val weldedVertexCount = mesh.weldedPositions.size / 3
        val weldedColorSumR = FloatArray(weldedVertexCount)
        val weldedColorSumG = FloatArray(weldedVertexCount)
        val weldedColorSumB = FloatArray(weldedVertexCount)
        val weldedColorCount = IntArray(weldedVertexCount)

        for (faceIdx in 0 until faceCount) {
            val face = mesh.faces[faceIdx]
            val cornerPos = Array(4) { c ->
                val wi = face[c]
                floatArrayOf(mesh.weldedPositions[wi * 3], mesh.weldedPositions[wi * 3 + 1], mesh.weldedPositions[wi * 3 + 2])
            }
            val cornerNormal = Array(4) { c ->
                val wi = face[c]
                floatArrayOf(mesh.weldedNormals[wi * 3], mesh.weldedNormals[wi * 3 + 1], mesh.weldedNormals[wi * 3 + 2])
            }
            var favgX = 0f
            var favgY = 0f
            var favgZ = 0f
            for (c in 0..3) {
                favgX += cornerNormal[c][0]; favgY += cornerNormal[c][1]; favgZ += cornerNormal[c][2]
            }
            val flen = sqrt(favgX * favgX + favgY * favgY + favgZ * favgZ).let { if (it > 1e-6f) it else 1f }
            val faceNormal = floatArrayOf(favgX / flen, favgY / flen, favgZ / flen)

            val tileRow = faceIdx / tilesPerRow
            val tileCol = faceIdx % tilesPerRow
            val cellOriginX = tileCol * CellSize
            val cellOriginY = tileRow * CellSize

            for (ty in 0 until CellSize) {
                for (tx in 0 until CellSize) {
                    val a = ((tx - TileGutter + 0.5f) / TileSize).coerceIn(0f, 1f)
                    val b = ((ty - TileGutter + 0.5f) / TileSize).coerceIn(0f, 1f)
                    val bottom = lerp3(cornerPos[0], cornerPos[1], a)
                    val top = lerp3(cornerPos[3], cornerPos[2], a)
                    val worldPoint = lerp3(bottom, top, b)
                    val color = sampleColor(worldPoint[0], worldPoint[1], worldPoint[2], faceNormal[0], faceNormal[1], faceNormal[2])
                    val px = cellOriginX + tx
                    val py = cellOriginY + ty
                    atlasPixels[py * atlasSize + px] = Color.rgb(
                        (color[0] * 255f).toInt().coerceIn(0, 255),
                        (color[1] * 255f).toInt().coerceIn(0, 255),
                        (color[2] * 255f).toInt().coerceIn(0, 255),
                    )
                }
            }

            for (c in 0..3) {
                val outIdx = faceIdx * 4 + c
                positions[outIdx * 3] = cornerPos[c][0]
                positions[outIdx * 3 + 1] = cornerPos[c][1]
                positions[outIdx * 3 + 2] = cornerPos[c][2]
                normals[outIdx * 3] = cornerNormal[c][0]
                normals[outIdx * 3 + 1] = cornerNormal[c][1]
                normals[outIdx * 3 + 2] = cornerNormal[c][2]
                val uv = cornerUv(c, cellOriginX, cellOriginY, atlasSize)
                uvs[outIdx * 2] = uv[0]
                uvs[outIdx * 2 + 1] = uv[1]

                val cornerColor = sampleColor(cornerPos[c][0], cornerPos[c][1], cornerPos[c][2], cornerNormal[c][0], cornerNormal[c][1], cornerNormal[c][2])
                val wi = face[c]
                weldedColorSumR[wi] += cornerColor[0]
                weldedColorSumG[wi] += cornerColor[1]
                weldedColorSumB[wi] += cornerColor[2]
                weldedColorCount[wi]++
            }
            val base = faceIdx * 4
            val idxBase = faceIdx * 6
            indices[idxBase] = base; indices[idxBase + 1] = base + 1; indices[idxBase + 2] = base + 2
            indices[idxBase + 3] = base; indices[idxBase + 4] = base + 2; indices[idxBase + 5] = base + 3
        }

        for (faceIdx in 0 until faceCount) {
            val face = mesh.faces[faceIdx]
            for (c in 0..3) {
                val outIdx = faceIdx * 4 + c
                val wi = face[c]
                val count = weldedColorCount[wi].coerceAtLeast(1)
                colors[outIdx * 3] = weldedColorSumR[wi] / count
                colors[outIdx * 3 + 1] = weldedColorSumG[wi] / count
                colors[outIdx * 3 + 2] = weldedColorSumB[wi] / count
            }
        }

        val atlasBitmap = Bitmap.createBitmap(atlasPixels, atlasSize, atlasSize, Bitmap.Config.ARGB_8888)
        return ForgeScanMesh(positions, normals, colors, indices, uvs, atlasBitmap)
    } finally {
        candidates.forEach { it.bitmap.recycle() }
    }
}

private fun lerp3(a: FloatArray, b: FloatArray, t: Float): FloatArray =
    floatArrayOf(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)

// Corner order 0,1,2,3 matches the (a,b) = (0,0),(1,0),(1,1),(0,1) bilinear
// parametrization used when baking the tile, and points at the tile's inner
// (non-gutter) region.
private fun cornerUv(corner: Int, cellOriginX: Int, cellOriginY: Int, atlasSize: Int): FloatArray {
    val offset = when (corner) {
        0 -> 0 to 0
        1 -> TileSize to 0
        2 -> TileSize to TileSize
        else -> 0 to TileSize
    }
    val px = cellOriginX + TileGutter + offset.first
    val py = cellOriginY + TileGutter + offset.second
    return floatArrayOf(px.toFloat() / atlasSize, py.toFloat() / atlasSize)
}

internal fun openScaledFrameBitmap(context: Context, uriString: String, maxSide: Int): Bitmap {
    val bitmap = openFrameBitmap(context, uriString)
    val longest = maxOf(bitmap.width, bitmap.height)
    if (longest <= maxSide) return bitmap
    val scale = maxSide.toFloat() / longest
    val scaled = Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true)
    if (scaled !== bitmap) bitmap.recycle()
    return scaled
}
