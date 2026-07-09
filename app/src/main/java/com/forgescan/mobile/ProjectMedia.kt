package com.forgescan.mobile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt

private const val MaxImageSide = 1400
private const val VideoFrameCount = 120

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

private fun Bitmap.scaledToMaxSide(maxSide: Int): Bitmap {
    val longest = max(width, height)
    if (longest <= maxSide) return this
    val scale = maxSide.toFloat() / longest.toFloat()
    return Bitmap.createScaledBitmap(this, (width * scale).roundToInt(), (height * scale).roundToInt(), true)
}

internal fun Int.toFrameNumber(): String = (this + 1).toString().padStart(3, '0')
