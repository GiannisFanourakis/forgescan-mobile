package com.forgescan.mobile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt

private const val MaxImageSide = 1400
private const val VideoFrameCount = 120

suspend fun importImagesIntoRing(
    context: Context,
    project: ForgeScanProject,
    ringId: String,
    uris: List<Uri>,
    onProgress: suspend (completed: Int, total: Int) -> Unit = { _, _ -> },
): ForgeScanProject {
    require(uris.isNotEmpty()) { "Select at least one image." }
    val ringDir = ringFrameDir(context, project.projectId, ringId)
    ringDir.listFiles()?.forEach { it.delete() }
    val orderedUris = orderImageUris(context, uris)
    onProgress(0, orderedUris.size)
    val frames = orderedUris.mapIndexed { index, uri ->
        decodeScaledBitmap(context, uri).use { bitmap ->
            val keepsAlpha = bitmap.hasAlpha()
            val extension = if (keepsAlpha) "png" else "jpg"
            val mimeType = if (keepsAlpha) "image/png" else "image/jpeg"
            val format = if (keepsAlpha) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG
            val quality = if (keepsAlpha) 100 else 88
            val file = File(ringDir, "frame-${index.toFrameNumber()}.$extension")
            file.outputStream().use { bitmap.compress(format, quality, it) }
            val frame = ForgeScanFrame("frame-${index.toFrameNumber()}", Uri.fromFile(file).toString(), index, mimeType)
            onProgress(index + 1, orderedUris.size)
            frame
        }
    }
    return project.withRingFrames(ringId, frames)
}

suspend fun importVideoIntoRing(
    context: Context,
    project: ForgeScanProject,
    ringId: String,
    videoUri: Uri,
    onProgress: suspend (completed: Int, total: Int) -> Unit = { _, _ -> },
): ForgeScanProject {
    val ringDir = ringFrameDir(context, project.projectId, ringId)
    ringDir.listFiles()?.forEach { it.delete() }
    val frames = mutableListOf<ForgeScanFrame>()
    val retriever = MediaMetadataRetriever()
    try {
        retriever.setDataSource(context, videoUri)
        val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
            ?.coerceAtLeast(1L) ?: 1L
        onProgress(0, VideoFrameCount)
        repeat(VideoFrameCount) { index ->
            val timeUs = durationMs * 1000L * index / VideoFrameCount
            val bitmap = retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST)
                ?: retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            if (bitmap != null) {
                val file = File(ringDir, "frame-${index.toFrameNumber()}.jpg")
                val scaled = bitmap.scaledToMaxSide(MaxImageSide)
                try {
                    file.outputStream().use { scaled.compress(Bitmap.CompressFormat.JPEG, 86, it) }
                } finally {
                    if (scaled !== bitmap) scaled.recycle()
                    bitmap.recycle()
                }
                frames += ForgeScanFrame("frame-${index.toFrameNumber()}", Uri.fromFile(file).toString(), frames.size)
            }
            onProgress(index + 1, VideoFrameCount)
        }
    } finally {
        retriever.release()
    }
    require(frames.isNotEmpty()) { "No frames could be extracted from this video." }
    return project.withRingFrames(ringId, frames)
}

private data class ImageImportItem(
    val uri: Uri,
    val sortName: String,
    val originalIndex: Int,
)

private fun orderImageUris(context: Context, uris: List<Uri>): List<Uri> {
    return uris.mapIndexed { index, uri ->
        ImageImportItem(uri, uri.displayName(context), index)
    }.sortedWith { left, right ->
        naturalCompare(left.sortName, right.sortName).takeIf { it != 0 }
            ?: left.originalIndex.compareTo(right.originalIndex)
    }.map { it.uri }
}

private fun Uri.displayName(context: Context): String {
    if (scheme == "content") {
        context.contentResolver.query(this, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null).use { cursor ->
            if (cursor != null && cursor.moveToFirst()) {
                val column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (column >= 0) return cursor.getString(column).orEmpty().ifBlank { toString() }
            }
        }
    }
    return lastPathSegment?.substringAfterLast('/')?.ifBlank { toString() } ?: toString()
}

private fun naturalCompare(left: String, right: String): Int {
    var leftIndex = 0
    var rightIndex = 0
    while (leftIndex < left.length && rightIndex < right.length) {
        val leftChar = left[leftIndex]
        val rightChar = right[rightIndex]
        if (leftChar.isDigit() && rightChar.isDigit()) {
            val leftStart = leftIndex
            val rightStart = rightIndex
            while (leftIndex < left.length && left[leftIndex].isDigit()) leftIndex += 1
            while (rightIndex < right.length && right[rightIndex].isDigit()) rightIndex += 1
            val leftNumber = left.substring(leftStart, leftIndex).trimStart('0').ifEmpty { "0" }
            val rightNumber = right.substring(rightStart, rightIndex).trimStart('0').ifEmpty { "0" }
            leftNumber.length.compareTo(rightNumber.length).takeIf { it != 0 }?.let { return it }
            leftNumber.compareTo(rightNumber).takeIf { it != 0 }?.let { return it }
        } else {
            leftChar.lowercaseChar().compareTo(rightChar.lowercaseChar()).takeIf { it != 0 }?.let { return it }
            leftIndex += 1
            rightIndex += 1
        }
    }
    return left.length.compareTo(right.length)
}

fun openFrameBitmap(context: Context, uriString: String): Bitmap {
    val uri = Uri.parse(uriString)
    return context.contentResolver.openInputStream(uri).use { stream ->
        requireNotNull(stream) { "Frame file could not be opened." }
        requireNotNull(BitmapFactory.decodeStream(stream)) { "Frame image could not be decoded." }
    }
}

internal fun ringFrameDir(context: Context, projectId: String, ringId: String): File {
    return File(projectRoot(context, projectId), "rings/$ringId/frames").apply { mkdirs() }
}

internal fun ringMaskDir(context: Context, projectId: String, ringId: String): File {
    return File(projectRoot(context, projectId), "rings/$ringId/masks").apply { mkdirs() }
}

private fun decodeScaledBitmap(context: Context, uri: Uri): Bitmap {
    if (Build.VERSION.SDK_INT >= 28) {
        val source = ImageDecoder.createSource(context.contentResolver, uri)
        return ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
            val scale = max(info.size.width, info.size.height).toFloat() / MaxImageSide
            if (scale > 1f) {
                decoder.setTargetSize(
                    (info.size.width / scale).roundToInt(),
                    (info.size.height / scale).roundToInt(),
                )
            }
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    }

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    val sample = calculateSampleSize(bounds.outWidth, bounds.outHeight, MaxImageSide)
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    return context.contentResolver.openInputStream(uri).use { stream ->
        requireNotNull(BitmapFactory.decodeStream(stream, null, options)) { "Image could not be decoded." }
    }
}

private fun calculateSampleSize(width: Int, height: Int, targetMaxSide: Int): Int {
    var sample = 1
    while ((width / sample) > targetMaxSide || (height / sample) > targetMaxSide) sample *= 2
    return sample
}

private fun Bitmap.scaledToMaxSide(maxSide: Int): Bitmap {
    val longest = max(width, height)
    if (longest <= maxSide) return this
    val scale = maxSide.toFloat() / longest.toFloat()
    return Bitmap.createScaledBitmap(this, (width * scale).roundToInt(), (height * scale).roundToInt(), true)
}

private inline fun <T> Bitmap.use(block: (Bitmap) -> T): T {
    try {
        return block(this)
    } finally {
        recycle()
    }
}

internal fun Int.toFrameNumber(): String = (this + 1).toString().padStart(3, '0')
