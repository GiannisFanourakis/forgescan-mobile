package com.forgescan.mobile

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.graphics.Bitmap
import java.nio.FloatBuffer

internal class LearnedMatch(val ax: Float, val ay: Float, val bx: Float, val by: Float, val score: Float)

// Wraps the fused SuperPoint+LightGlue ONNX pipeline (assets/superpoint_lightglue.onnx,
// exported from https://github.com/fabio-sim/LightGlue-ONNX v2.0 release) as a
// drop-in replacement for ORB+BFMatcher for the specific case that breaks
// ORB: a cross-ring pair whose viewpoint change is too large for a
// hand-crafted descriptor to bridge. Confirmed on a real capture: ORB found
// a usable match in only 4/64 sampled cross-ring pairs (elevations 1.3deg
// vs 48.9deg), and 3 of those 4 recovered geometrically impossible angles.
// The same 64 pairs run through this matcher instead produced many more raw
// matches per pair AND, critically, multiple INDEPENDENTLY plausible pairs
// whose implied azimuth phase offsets actually clustered together - the
// signal registerRings' clustering step needs and never had before.
//
// CPU-only (no GPU/NNAPI execution provider - see build.gradle.kts): this is
// a heavier model than ORB (roughly a second per pair on a modern CPU at
// 640px, versus ORB's ~100ms), which matters because cross-ring registration
// calls it up to MaxCrossRingSamplesPerRing^2 times per ring pair.
internal object LearnedMatcher {
    private const val ModelAssetName = "superpoint_lightglue.onnx"

    // Matches TurntableSfm.kt's FeatureImageMaxSide - same speed/accuracy
    // tradeoff convention already tuned for this pipeline's other matcher.
    private const val TargetMaxSide = 640

    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private var session: OrtSession? = null

    @Synchronized
    private fun ensureSession(context: Context): OrtSession {
        session?.let { return it }
        val bytes = context.assets.open(ModelAssetName).use { it.readBytes() }
        val created = env.createSession(bytes, OrtSession.SessionOptions())
        session = created
        return created
    }

    // Returns matches in each bitmap's OWN original pixel space - both
    // frames are resized to a shared (width, height) internally (the
    // model's batched "images" input requires identical dimensions for both
    // frames of a pair), then coordinates are rescaled back so callers never
    // need to know this matcher's internal working resolution, exactly like
    // the ORB path callers already don't need to know FeatureImageMaxSide.
    @Synchronized
    fun match(context: Context, bitmapA: Bitmap, bitmapB: Bitmap): List<LearnedMatch> {
        val session = ensureSession(context)

        val longSide = maxOf(bitmapA.width, bitmapA.height, bitmapB.width, bitmapB.height)
        val scale = TargetMaxSide.toFloat() / longSide.toFloat()
        // The export tooling's own fixed-shape exports require a multiple
        // of 8 (SuperPoint's downsampling stride); this dynamic-shape graph
        // tolerated a non-multiple in manual testing, but rounding costs
        // nothing and stays on the tooling's own documented-safe path.
        val dimDivisor = 8
        val targetW = roundToMultiple((bitmapA.width.coerceAtLeast(bitmapB.width) * scale).toInt(), dimDivisor).coerceAtLeast(dimDivisor)
        val targetH = roundToMultiple((bitmapA.height.coerceAtLeast(bitmapB.height) * scale).toInt(), dimDivisor).coerceAtLeast(dimDivisor)

        val grayA = toLumaFloatArray(bitmapA, targetW, targetH)
        val grayB = toLumaFloatArray(bitmapB, targetW, targetH)

        val buffer = FloatBuffer.allocate(2 * targetH * targetW)
        buffer.put(grayA)
        buffer.put(grayB)
        buffer.rewind()

        OnnxTensor.createTensor(env, buffer, longArrayOf(2, 1, targetH.toLong(), targetW.toLong())).use { inputTensor ->
            session.run(mapOf("images" to inputTensor)).use { result ->
                @Suppress("UNCHECKED_CAST")
                val keypoints = result.get("keypoints").get().value as Array<Array<LongArray>>
                @Suppress("UNCHECKED_CAST")
                val matches = result.get("matches").get().value as Array<LongArray>
                val scores = result.get("mscores").get().value as FloatArray

                val scaleBackAX = bitmapA.width.toFloat() / targetW
                val scaleBackAY = bitmapA.height.toFloat() / targetH
                val scaleBackBX = bitmapB.width.toFloat() / targetW
                val scaleBackBY = bitmapB.height.toFloat() / targetH

                val out = ArrayList<LearnedMatch>(matches.size)
                for (i in matches.indices) {
                    val idxA = matches[i][1].toInt()
                    val idxB = matches[i][2].toInt()
                    val kpA = keypoints[0][idxA]
                    val kpB = keypoints[1][idxB]
                    out += LearnedMatch(
                        ax = kpA[0] * scaleBackAX,
                        ay = kpA[1] * scaleBackAY,
                        bx = kpB[0] * scaleBackBX,
                        by = kpB[1] * scaleBackBY,
                        score = scores[i],
                    )
                }
                return out
            }
        }
    }

    private fun roundToMultiple(value: Int, multiple: Int): Int {
        val remainder = value % multiple
        return if (remainder == 0) value else value + (multiple - remainder)
    }

    // Standard BT.601 luma weights - matches the model's own published
    // SuperPointPreprocessor formula exactly (image[...,::-1]/255 *
    // [0.299,0.587,0.114], summed over channels: BGR reversed to RGB then
    // luma-weighted is 0.299R+0.587G+0.114B), so this is a verified match to
    // what the model expects, not an approximation.
    private fun toLumaFloatArray(bitmap: Bitmap, targetW: Int, targetH: Int): FloatArray {
        val scaled = if (bitmap.width == targetW && bitmap.height == targetH) {
            bitmap
        } else {
            Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
        }
        val pixels = IntArray(targetW * targetH)
        scaled.getPixels(pixels, 0, targetW, 0, 0, targetW, targetH)
        if (scaled !== bitmap) scaled.recycle()
        val out = FloatArray(targetW * targetH)
        for (i in pixels.indices) {
            val p = pixels[i]
            val r = (p shr 16) and 0xFF
            val g = (p shr 8) and 0xFF
            val b = p and 0xFF
            out[i] = (0.299f * r + 0.587f * g + 0.114f * b) / 255f
        }
        return out
    }
}
