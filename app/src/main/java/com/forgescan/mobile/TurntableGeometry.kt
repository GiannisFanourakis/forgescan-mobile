package com.forgescan.mobile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import kotlin.math.cos
import kotlin.math.sin

// Fixed per-ring elevation offsets (degrees), based on standard multi-ring
// photogrammetry capture guidance: a near-horizontal ring constrains an
// object's sides, a steep ring constrains its top, and a flipped-object ring
// is the only way to constrain the true base. There is no calibrated camera
// distance available (capture is a hand-off to whatever camera app the user
// has), so these are fixed assumptions rather than measured values.
private val RingElevationDegrees: Map<String, Float> = mapOf(
    "upright" to 10f,
    "tilted" to 60f,
    "underside" to 190f,
)
private const val DefaultElevationDegrees = 10f

internal const val SilhouetteGridSize = 256

// Precomputed per-frame projection: dot (x,y,z) with (ux,uy,uz) and
// (vx,vy,vz) to get the frame's orthographic image-plane (u,v), avoiding any
// trig calls in the voxel-carving hot loop.
internal class FrameProjection(
    val ux: Float,
    val uy: Float,
    val uz: Float,
    val vx: Float,
    val vy: Float,
    val vz: Float,
)

internal class RingSilhouettes(
    val ringId: String,
    val projections: List<FrameProjection>,
    val silhouettes: List<BooleanArray>,
    val gridSize: Int,
    // Maps a raw projected (u,v) - in canonical object-space units, roughly
    // [-1,1] - onto the actual pixel region the object occupies in the
    // silhouette frames, so the full voxel grid resolution is spent on the
    // object instead of mostly on empty margin around it.
    val centerU: Float,
    val centerV: Float,
    val halfExtent: Float,
)

internal fun loadRingSilhouettes(context: Context, project: ForgeScanProject, ring: ForgeScanRing): RingSilhouettes? {
    val frameCount = ring.frames.size
    if (frameCount == 0) return null
    val maskDir = ringMaskDir(context, project.projectId, ring.ringId)
    val silhouettes = ring.frames.indices.mapNotNull { index ->
        val file = File(maskDir, "frame-${index.toFrameNumber()}-silhouette.png")
        if (!file.exists()) return@mapNotNull null
        decodeSilhouette(file, SilhouetteGridSize)
    }
    if (silhouettes.size != frameCount) return null

    val elevationRad = Math.toRadians((RingElevationDegrees[ring.ringId] ?: DefaultElevationDegrees).toDouble())
    val cosE = cos(elevationRad).toFloat()
    val sinE = sin(elevationRad).toFloat()
    val projections = (0 until frameCount).map { i ->
        val angleRad = Math.toRadians((i.toFloat() / frameCount * 360f).toDouble())
        val cosA = cos(angleRad).toFloat()
        val sinA = sin(angleRad).toFloat()
        FrameProjection(
            ux = cosA, uy = 0f, uz = sinA,
            vx = sinA * sinE, vy = cosE, vz = -cosA * sinE,
        )
    }

    // Union bounding box across every frame in this ring (not per-frame -
    // that would rescale the object to fill each shot and destroy the width
    // signal carving depends on). Turntable rotation changes apparent width
    // as the object turns, so the union across the full rotation is the
    // right normalization reference.
    var minU = Float.MAX_VALUE
    var maxU = -Float.MAX_VALUE
    var minV = Float.MAX_VALUE
    var maxV = -Float.MAX_VALUE
    for (silhouette in silhouettes) {
        for (py in 0 until SilhouetteGridSize) {
            val rowStart = py * SilhouetteGridSize
            for (px in 0 until SilhouetteGridSize) {
                if (!silhouette[rowStart + px]) continue
                val u = (px.toFloat() / SilhouetteGridSize) * 2f - 1f
                val v = (py.toFloat() / SilhouetteGridSize) * 2f - 1f
                if (u < minU) minU = u
                if (u > maxU) maxU = u
                if (v < minV) minV = v
                if (v > maxV) maxV = v
            }
        }
    }
    val hasSilhouette = minU <= maxU && minV <= maxV
    val centerU = if (hasSilhouette) (minU + maxU) / 2f else 0f
    val centerV = if (hasSilhouette) (minV + maxV) / 2f else 0f
    // 8% padding so the object's true edge doesn't land exactly on the voxel
    // grid boundary, which could clip thin protruding parts right at the edge.
    val halfExtent = if (hasSilhouette) maxOf(maxU - minU, maxV - minV) / 2f * 1.08f else 1f

    return RingSilhouettes(ring.ringId, projections, silhouettes, SilhouetteGridSize, centerU, centerV, halfExtent)
}

private fun decodeSilhouette(file: File, targetSize: Int): BooleanArray {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    val sample = maxOf(1, minOf(bounds.outWidth, bounds.outHeight) / targetSize)
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    val bitmap = BitmapFactory.decodeFile(file.absolutePath, options) ?: return BooleanArray(targetSize * targetSize)
    val scaled = Bitmap.createScaledBitmap(bitmap, targetSize, targetSize, true)
    if (scaled !== bitmap) bitmap.recycle()
    val pixels = IntArray(targetSize * targetSize)
    scaled.getPixels(pixels, 0, targetSize, 0, 0, targetSize, targetSize)
    scaled.recycle()
    return BooleanArray(targetSize * targetSize) { i -> (pixels[i] and 0xFF) > 127 }
}

// Orthographic silhouette test: no calibrated camera distance is available,
// so only rotation angle and elevation are modeled - see loadRingSilhouettes.
internal fun sampleSilhouette(ring: RingSilhouettes, frameIndex: Int, x: Float, y: Float, z: Float): Boolean {
    val p = ring.projections[frameIndex]
    val rawU = p.ux * x + p.uy * y + p.uz * z
    val rawV = p.vx * x + p.vy * y + p.vz * z
    val u = ring.centerU + rawU * ring.halfExtent
    val v = ring.centerV + rawV * ring.halfExtent
    val gx = ((u + 1f) * 0.5f * ring.gridSize).toInt().coerceIn(0, ring.gridSize - 1)
    val gy = ((1f - (v + 1f) * 0.5f) * ring.gridSize).toInt().coerceIn(0, ring.gridSize - 1)
    return ring.silhouettes[frameIndex][gy * ring.gridSize + gx]
}
