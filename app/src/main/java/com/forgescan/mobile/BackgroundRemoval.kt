package com.forgescan.mobile

import android.content.Context
import android.graphics.Bitmap
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.abs
import kotlinx.coroutines.suspendCancellableCoroutine

private val SubjectSegmenterOptionsInstance = SubjectSegmenterOptions.Builder()
    .enableForegroundConfidenceMask()
    .build()

private const val FeatherLow = 0.35f
private const val FeatherHigh = 0.65f
private const val CleanupRadius = 2
private const val AlphaBlurRadius = 1
private const val AmbiguousLow = 0.25f
private const val AmbiguousHigh = 0.75f
private const val BackgroundSampleFrameCount = 9
private const val BackgroundMatchTolerance = 28
private const val TemporalWindowRadius = 2
private const val ThumbnailSize = 48

private class BackgroundPlate(val width: Int, val height: Int, val pixels: IntArray)

private class FrameWork(
    val index: Int,
    val pixels: IntArray,
    val confidence: FloatArray,
    val width: Int,
    val height: Int,
)

private class MaskResult(val alpha: Bitmap, val silhouette: BooleanArray, val width: Int, val height: Int)

// Masks every frame in one ring: the same ML Kit Subject Segmentation plus
// turntable background-plate and temporal-smoothing approach already proven
// in SpinForge360-Mobile, applied per ring since the background-plate
// assumption holds within a ring's own frames, not across rings shot at
// different elevations/backgrounds. Writes both a soft-alpha cutout (for
// later texture edge blending) and a binary silhouette (for visual hull
// carving) per frame.
suspend fun maskRing(
    context: Context,
    project: ForgeScanProject,
    ringId: String,
    onPreparing: suspend () -> Unit = {},
    onProgress: suspend (completed: Int, total: Int) -> Unit = { _, _ -> },
) {
    val ring = project.rings.first { it.ringId == ringId }
    val frames = ring.frames
    if (frames.isEmpty()) return
    val segmenter = SubjectSegmentation.getClient(SubjectSegmenterOptionsInstance)
    try {
        ensureSubjectSegmentationModelReady(context, segmenter, onPreparing)
        val total = frames.size
        val maskDir = ringMaskDir(context, project.projectId, ringId)
        val backgroundPlate = buildBackgroundPlate(context, frames)
        val adjacentSimilarity = computeAdjacentSimilarity(context, frames)

        suspend fun computeWork(index: Int): FrameWork {
            val frame = frames[index]
            val original = openFrameBitmap(context, frame.uri)
            val width = original.width
            val height = original.height
            val pixels = IntArray(width * height)
            original.getPixels(pixels, 0, width, 0, 0, width, height)
            val result = try {
                segmenter.process(InputImage.fromBitmap(original, 0)).await()
            } finally {
                original.recycle()
            }
            val confidenceBuffer = requireNotNull(result.foregroundConfidenceMask) {
                "No confidence mask returned for frame ${index + 1}."
            }
            val confidence = FloatArray(width * height)
            confidenceBuffer.rewind()
            confidenceBuffer.get(confidence)
            return FrameWork(index, pixels, confidence, width, height)
        }

        onProgress(0, total)
        val radius = TemporalWindowRadius
        val window = ArrayDeque<FrameWork>()
        var loadedUpTo = -1
        for (centerIndex in 0 until total) {
            val loadTarget = minOf(centerIndex + radius, total - 1)
            while (loadedUpTo < loadTarget) {
                loadedUpTo += 1
                window.addLast(computeWork(loadedUpTo))
            }
            while (window.isNotEmpty() && window.first().index < centerIndex - radius) window.removeFirst()
            val center = window.first { it.index == centerIndex }

            val confidence = temporalSmooth(center, window, adjacentSimilarity, radius)
            val mask = cutoutForeground(center.pixels, center.width, center.height, confidence, backgroundPlate)

            val alphaFile = File(maskDir, "frame-${centerIndex.toFrameNumber()}-alpha.png")
            alphaFile.outputStream().use { mask.alpha.compress(Bitmap.CompressFormat.PNG, 100, it) }
            mask.alpha.recycle()

            val silhouetteFile = File(maskDir, "frame-${centerIndex.toFrameNumber()}-silhouette.png")
            writeSilhouettePng(mask.silhouette, mask.width, mask.height, silhouetteFile)

            onProgress(centerIndex + 1, total)
        }
    } finally {
        segmenter.close()
    }
}

private fun writeSilhouettePng(silhouette: BooleanArray, width: Int, height: Int, file: File) {
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val pixels = IntArray(width * height) { i -> if (silhouette[i]) 0xFFFFFFFF.toInt() else 0xFF000000.toInt() }
    bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
    file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bitmap.recycle()
}

private fun temporalSmooth(
    center: FrameWork,
    window: ArrayDeque<FrameWork>,
    adjacentSimilarity: FloatArray,
    radius: Int,
): FloatArray {
    val weighted = window.mapNotNull { entry ->
        if (abs(entry.index - center.index) > radius) return@mapNotNull null
        if (entry.width != center.width || entry.height != center.height) return@mapNotNull null
        entry to cumulativeSimilarity(adjacentSimilarity, center.index, entry.index)
    }
    val pixelCount = center.confidence.size
    val result = FloatArray(pixelCount)
    for (i in 0 until pixelCount) {
        var sum = 0f
        var weightSum = 0f
        for ((entry, weight) in weighted) {
            sum += entry.confidence[i] * weight
            weightSum += weight
        }
        result[i] = if (weightSum > 0f) sum / weightSum else center.confidence[i]
    }
    return result
}

private fun cumulativeSimilarity(adjacentSimilarity: FloatArray, a: Int, b: Int): Float {
    if (a == b) return 1f
    val lo = minOf(a, b)
    val hi = maxOf(a, b)
    var product = 1f
    for (k in lo until hi) product *= adjacentSimilarity[k]
    return product
}

private fun computeAdjacentSimilarity(context: Context, frames: List<ForgeScanFrame>): FloatArray {
    if (frames.size < 2) return FloatArray(0)
    val thumbnails = frames.map { frame ->
        val bitmap = openFrameBitmap(context, frame.uri)
        val scaled = Bitmap.createScaledBitmap(bitmap, ThumbnailSize, ThumbnailSize, true)
        if (scaled !== bitmap) bitmap.recycle()
        val pixels = IntArray(ThumbnailSize * ThumbnailSize)
        scaled.getPixels(pixels, 0, ThumbnailSize, 0, 0, ThumbnailSize, ThumbnailSize)
        scaled.recycle()
        pixels
    }
    return FloatArray(thumbnails.size - 1) { i ->
        val a = thumbnails[i]
        val b = thumbnails[i + 1]
        var diff = 0L
        for (p in a.indices) diff += channelDiff(a[p], b[p])
        val maxDiff = a.size.toLong() * 255L * 3L
        1f - (diff.toFloat() / maxDiff.toFloat())
    }
}

private fun channelDiff(a: Int, b: Int): Int {
    val dr = abs(((a shr 16) and 0xFF) - ((b shr 16) and 0xFF))
    val dg = abs(((a shr 8) and 0xFF) - ((b shr 8) and 0xFF))
    val db = abs((a and 0xFF) - (b and 0xFF))
    return dr + dg + db
}

private fun buildBackgroundPlate(context: Context, frames: List<ForgeScanFrame>): BackgroundPlate? {
    if (frames.size < BackgroundSampleFrameCount) return null
    val sampleIndices = (0 until BackgroundSampleFrameCount)
        .map { it * (frames.size - 1) / (BackgroundSampleFrameCount - 1) }
        .distinct()
    val samples = sampleIndices.map { openFrameBitmap(context, frames[it].uri) }
    val width = samples[0].width
    val height = samples[0].height
    if (samples.any { it.width != width || it.height != height }) {
        samples.forEach { it.recycle() }
        return null
    }

    val pixelCount = width * height
    val samplePixels = samples.map { bitmap ->
        IntArray(pixelCount).also { bitmap.getPixels(it, 0, width, 0, 0, width, height) }
    }
    samples.forEach { it.recycle() }

    val plate = IntArray(pixelCount)
    val reds = IntArray(samplePixels.size)
    val greens = IntArray(samplePixels.size)
    val blues = IntArray(samplePixels.size)
    for (i in 0 until pixelCount) {
        for (s in samplePixels.indices) {
            val pixel = samplePixels[s][i]
            reds[s] = (pixel shr 16) and 0xFF
            greens[s] = (pixel shr 8) and 0xFF
            blues[s] = pixel and 0xFF
        }
        reds.sort()
        greens.sort()
        blues.sort()
        val mid = samplePixels.size / 2
        plate[i] = (0xFF shl 24) or (reds[mid] shl 16) or (greens[mid] shl 8) or blues[mid]
    }
    return BackgroundPlate(width, height, plate)
}

private fun colorsClose(a: Int, b: Int, tolerance: Int): Boolean {
    val dr = ((a shr 16) and 0xFF) - ((b shr 16) and 0xFF)
    val dg = ((a shr 8) and 0xFF) - ((b shr 8) and 0xFF)
    val db = (a and 0xFF) - (b and 0xFF)
    return abs(dr) <= tolerance && abs(dg) <= tolerance && abs(db) <= tolerance
}

private fun cutoutForeground(
    pixels: IntArray,
    width: Int,
    height: Int,
    confidence: FloatArray,
    backgroundPlate: BackgroundPlate?,
): MaskResult {
    val pixelCount = width * height
    val confidenceValues = confidence.copyOf()

    if (backgroundPlate != null && backgroundPlate.width == width && backgroundPlate.height == height) {
        for (i in 0 until pixelCount) {
            val c = confidenceValues[i]
            if (c in AmbiguousLow..AmbiguousHigh && colorsClose(pixels[i], backgroundPlate.pixels[i], BackgroundMatchTolerance)) {
                confidenceValues[i] = 0f
            }
        }
    }

    val rawForeground = BooleanArray(pixelCount) { confidenceValues[it] >= 0.5f }
    val cleanedForeground = morphClose(morphOpen(rawForeground, width, height, CleanupRadius), width, height, CleanupRadius)

    val alphaValues = FloatArray(pixelCount) { i ->
        val effective = if (cleanedForeground[i] == rawForeground[i]) {
            confidenceValues[i]
        } else if (cleanedForeground[i]) {
            maxOf(confidenceValues[i], FeatherHigh)
        } else {
            minOf(confidenceValues[i], FeatherLow)
        }
        smoothstep(FeatherLow, FeatherHigh, effective)
    }
    val smoothedAlpha = boxBlur(alphaValues, width, height, AlphaBlurRadius)

    val output = pixels.copyOf()
    for (i in 0 until pixelCount) {
        val alpha = (smoothedAlpha[i] * 255f).toInt().coerceIn(0, 255)
        output[i] = (alpha shl 24) or (output[i] and 0x00FFFFFF)
    }

    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    bitmap.setPixels(output, 0, width, 0, 0, width, height)
    return MaskResult(bitmap, cleanedForeground, width, height)
}

private fun boxBlur(values: FloatArray, width: Int, height: Int, radius: Int): FloatArray {
    val horizontal = boxAverage(values, width, height, radius, horizontal = true)
    return boxAverage(horizontal, width, height, radius, horizontal = false)
}

private fun boxAverage(values: FloatArray, width: Int, height: Int, radius: Int, horizontal: Boolean): FloatArray {
    val result = FloatArray(values.size)
    if (horizontal) {
        for (y in 0 until height) {
            val rowStart = y * width
            for (x in 0 until width) {
                val from = (x - radius).coerceAtLeast(0)
                val to = (x + radius).coerceAtMost(width - 1)
                var sum = 0f
                for (nx in from..to) sum += values[rowStart + nx]
                result[rowStart + x] = sum / (to - from + 1)
            }
        }
    } else {
        for (x in 0 until width) {
            for (y in 0 until height) {
                val from = (y - radius).coerceAtLeast(0)
                val to = (y + radius).coerceAtMost(height - 1)
                var sum = 0f
                for (ny in from..to) sum += values[ny * width + x]
                result[y * width + x] = sum / (to - from + 1)
            }
        }
    }
    return result
}

private fun smoothstep(edgeLow: Float, edgeHigh: Float, value: Float): Float {
    val t = ((value - edgeLow) / (edgeHigh - edgeLow)).coerceIn(0f, 1f)
    return t * t * (3f - 2f * t)
}

private fun morphOpen(mask: BooleanArray, width: Int, height: Int, radius: Int): BooleanArray =
    dilate(erode(mask, width, height, radius), width, height, radius)

private fun morphClose(mask: BooleanArray, width: Int, height: Int, radius: Int): BooleanArray =
    erode(dilate(mask, width, height, radius), width, height, radius)

private fun erode(mask: BooleanArray, width: Int, height: Int, radius: Int): BooleanArray {
    val horizontal = boxReduce(mask, width, height, radius, horizontal = true, identity = true) { a, b -> a && b }
    return boxReduce(horizontal, width, height, radius, horizontal = false, identity = true) { a, b -> a && b }
}

private fun dilate(mask: BooleanArray, width: Int, height: Int, radius: Int): BooleanArray {
    val horizontal = boxReduce(mask, width, height, radius, horizontal = true, identity = false) { a, b -> a || b }
    return boxReduce(horizontal, width, height, radius, horizontal = false, identity = false) { a, b -> a || b }
}

private inline fun boxReduce(
    mask: BooleanArray,
    width: Int,
    height: Int,
    radius: Int,
    horizontal: Boolean,
    identity: Boolean,
    combine: (Boolean, Boolean) -> Boolean,
): BooleanArray {
    val result = BooleanArray(mask.size)
    if (horizontal) {
        for (y in 0 until height) {
            val rowStart = y * width
            for (x in 0 until width) {
                var value = identity
                val from = (x - radius).coerceAtLeast(0)
                val to = (x + radius).coerceAtMost(width - 1)
                for (nx in from..to) value = combine(value, mask[rowStart + nx])
                result[rowStart + x] = value
            }
        }
    } else {
        for (x in 0 until width) {
            for (y in 0 until height) {
                var value = identity
                val from = (y - radius).coerceAtLeast(0)
                val to = (y + radius).coerceAtMost(height - 1)
                for (ny in from..to) value = combine(value, mask[ny * width + x])
                result[y * width + x] = value
            }
        }
    }
    return result
}

private suspend fun ensureSubjectSegmentationModelReady(
    context: Context,
    segmenter: SubjectSegmenter,
    onPreparing: suspend () -> Unit,
) {
    val moduleInstallClient = ModuleInstall.getClient(context)
    val availability = moduleInstallClient.areModulesAvailable(segmenter).await()
    if (availability.areModulesAvailable()) return
    onPreparing()
    val request = ModuleInstallRequest.Builder().addApi(segmenter).build()
    moduleInstallClient.installModules(request).await()
}

private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { continuation.resume(it) }
    addOnFailureListener { continuation.resumeWithException(it) }
}
