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
// has), so these are fixed assumptions rather than measured values. Internal
// (not private): GaussianSplatExporter.kt falls back to the same constants
// when estimateRingElevationDegrees can't measure a ring, rather than
// guessing a second, possibly-inconsistent default.
internal val RingElevationDegrees: Map<String, Float> = mapOf(
    "upright" to 10f,
    "tilted" to 60f,
    "underside" to 190f,
)
internal const val DefaultElevationDegrees = 10f

// Higher than the 128^3 voxel grid actually needs for carving accuracy
// itself (sampleSilhouette does a lookup, not a scan, so carving cost is
// independent of this). What it buys is not losing a thin real feature - a
// handle's cross-section - to the mask's own downsample before carving ever
// sees it: at some rotation angles a thin handle projects to only a handful
// of pixels, and aggressively downsampling the mask first can anti-alias
// that away before the "unanimous frames" carving rule even gets a chance.
internal const val SilhouetteGridSize = 512

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

internal fun loadRingSilhouettes(
    context: Context,
    project: ForgeScanProject,
    ring: ForgeScanRing,
    azimuthPhaseOffsetDegrees: Float = 0f,
): RingSilhouettes? {
    val frameCount = ring.frames.size
    if (frameCount == 0) return null
    val maskDir = ringMaskDir(context, project.projectId, ring.ringId)
    val silhouettes = ring.frames.indices.mapNotNull { index ->
        val file = File(maskDir, "frame-${index.toFrameNumber()}-silhouette.png")
        if (!file.exists()) return@mapNotNull null
        decodeSilhouette(file, SilhouetteGridSize)
    }
    if (silhouettes.size != frameCount) return null

    // The measurement is a magnitude in [0, 90] (how face-on vs. top-down the
    // camera was for this ring's own footage); the "underside" ring is the
    // object physically flipped over, so a successful measurement is placed
    // past 180 in the canonical frame, mirroring what the old hardcoded 190
    // (180 + 10) encoded, but using this ring's own measured shallowness
    // instead of assuming it matches the upright ring's. A failed measurement
    // (too little texture/too few frames) falls back to the old hardcoded
    // per-ring constant, already expressed in final canonical-frame terms.
    val measuredMagnitude = estimateRingElevationDegrees(context, project.projectId, ring)
    val elevationDegrees = if (measuredMagnitude != null) {
        if (ring.ringId == "underside") 180f + measuredMagnitude else measuredMagnitude
    } else {
        RingElevationDegrees[ring.ringId] ?: DefaultElevationDegrees
    }
    val elevationRad = Math.toRadians(elevationDegrees.toDouble())
    val cosE = cos(elevationRad).toFloat()
    val sinE = sin(elevationRad).toFloat()
    // Tried measuring the actual cumulative rotation angle per frame
    // (epipolar geometry between real frame pairs, same idea as the
    // elevation measurement above) instead of assuming perfectly even
    // spacing. Reverted: unlike elevation - a median across ~16 independent
    // measurements, where noise doesn't compound - the angle measurement
    // summed ~16-17 sequential segments into a running total, so any small
    // per-segment bias accumulated linearly across the sequence. On the
    // capture this was tested against, later frames' assumed angle drifted
    // enough to over-carve real geometry that should have survived (the
    // turntable's true width and the handle both visibly shrank versus a
    // capture with identical masks run through the uniform assumption).
    // Simple uniform spacing is a weaker model of the real turntable, but
    // it doesn't have a failure mode that gets worse the longer the ring is.
    //
    // azimuthPhaseOffsetDegrees shifts this ring's whole azimuth track by a
    // constant - the relative phase RingRegistration.kt's registerRings
    // solved for, when this ring is being combined with another one for
    // carving. Zero for a single-ring carve (the default) or for whichever
    // ring in a combined carve is being treated as the reference; carving
    // multiple rings together without this correction silently assumes
    // every ring's frame 0 landed on the same real-world azimuth, which two
    // independently-captured rings have no reason to satisfy.
    val projections = (0 until frameCount).map { i ->
        val angleDegrees = i.toFloat() / frameCount * 360f + azimuthPhaseOffsetDegrees
        val angleRad = Math.toRadians(angleDegrees.toDouble())
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
    val raw = BooleanArray(targetSize * targetSize) { i -> (pixels[i] and 0xFF) > 127 }
    return dilateSilhouette(raw, targetSize, MaskDilationPasses)
}

// Generic subject-segmentation models systematically under-include thin
// protruding features - a handle's cross-section commonly erodes to a
// couple of pixels, or drops out entirely, at whatever rotation angles view
// it edge-on - and carving's "every frame must agree" rule only needs ONE
// frame to miss a feature for it to vanish from the model permanently, no
// matter how many other frames captured it fine. Growing the mask by a
// couple of pixels trades a little precision at the object's true
// silhouette boundary (now slightly generous) for not losing real thin
// geometry to segmentation noise before carving ever gets a chance to see
// it - single-ring captures can't afford to lose more information than
// they already inherently have to.
private const val MaskDilationPasses = 2

private fun dilateSilhouette(source: BooleanArray, size: Int, passes: Int): BooleanArray {
    var current = source
    repeat(passes) {
        val next = BooleanArray(size * size)
        for (y in 0 until size) {
            for (x in 0 until size) {
                val idx = y * size + x
                next[idx] = current[idx] ||
                    (x > 0 && current[idx - 1]) ||
                    (x < size - 1 && current[idx + 1]) ||
                    (y > 0 && current[idx - size]) ||
                    (y < size - 1 && current[idx + size])
            }
        }
        current = next
    }
    return current
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
