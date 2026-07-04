package com.forgescan.mobile

import android.content.Context
import java.io.File
import java.time.Instant
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

data class ForgeScanProject(
    val projectId: String,
    val title: String,
    val createdAt: String,
    val updatedAt: String,
    val rings: List<ForgeScanRing>,
)

data class ForgeScanRing(
    val ringId: String,
    val label: String,
    val frames: List<ForgeScanFrame> = emptyList(),
)

data class ForgeScanFrame(
    val frameId: String,
    val uri: String,
    val order: Int,
    val mimeType: String = "image/jpeg",
)

internal const val DefaultRingId = "upright"
internal const val DefaultRingLabel = "Upright"

fun createForgeScanProject(
    projectId: String = UUID.randomUUID().toString(),
    title: String,
): ForgeScanProject {
    val now = Instant.now().toString()
    return ForgeScanProject(
        projectId = projectId,
        title = title.ifBlank { "ForgeScan Project" },
        createdAt = now,
        updatedAt = now,
        rings = listOf(ForgeScanRing(ringId = DefaultRingId, label = DefaultRingLabel)),
    )
}

fun ForgeScanProject.withRingFrames(ringId: String, frames: List<ForgeScanFrame>): ForgeScanProject {
    val updatedRings = rings.map { ring -> if (ring.ringId == ringId) ring.copy(frames = frames) else ring }
    return copy(rings = updatedRings, updatedAt = Instant.now().toString())
}

fun ForgeScanProject.addRing(ringId: String, label: String): ForgeScanProject {
    if (rings.any { it.ringId == ringId }) return this
    return copy(rings = rings + ForgeScanRing(ringId = ringId, label = label), updatedAt = Instant.now().toString())
}

fun ForgeScanProject.removeRing(ringId: String): ForgeScanProject {
    return copy(rings = rings.filterNot { it.ringId == ringId }, updatedAt = Instant.now().toString())
}

fun validateProject(project: ForgeScanProject): List<String> = buildList {
    val populatedRings = project.rings.filter { it.frames.isNotEmpty() }
    if (populatedRings.isEmpty()) {
        add("Error: at least one ring needs frames before processing.")
    }
    populatedRings.forEach { ring ->
        if (ring.frames.size < 8) {
            add("Warning: ring '${ring.label}' has fewer than 8 frames.")
        }
    }
    val duplicateIds = project.rings
        .groupingBy { it.ringId }
        .eachCount()
        .filterValues { it > 1 }
        .keys
    if (duplicateIds.isNotEmpty()) {
        add("Error: duplicate ring IDs: ${duplicateIds.joinToString()}.")
    }
}

internal fun projectRoot(context: Context, projectId: String): File =
    File(context.filesDir, "projects/$projectId").apply { mkdirs() }

fun saveProject(context: Context, project: ForgeScanProject) {
    File(projectRoot(context, project.projectId), "project.json").writeText(project.toJson().toString())
}

fun loadMostRecentProject(context: Context): ForgeScanProject? {
    val projectsDir = File(context.filesDir, "projects")
    val candidates = projectsDir.listFiles { file -> file.isDirectory } ?: return null
    return candidates.mapNotNull { dir ->
        val jsonFile = File(dir, "project.json")
        if (!jsonFile.exists()) return@mapNotNull null
        runCatching { jsonFile.readText().let(::JSONObject).let(::forgeScanProjectFromJson) }.getOrNull()
    }.maxByOrNull { it.updatedAt }
}

private fun ForgeScanProject.toJson(): JSONObject = JSONObject().apply {
    put("projectId", projectId)
    put("title", title)
    put("createdAt", createdAt)
    put("updatedAt", updatedAt)
    put(
        "rings",
        JSONArray().apply {
            rings.forEach { ring ->
                put(
                    JSONObject().apply {
                        put("ringId", ring.ringId)
                        put("label", ring.label)
                        put(
                            "frames",
                            JSONArray().apply {
                                ring.frames.forEach { frame ->
                                    put(
                                        JSONObject().apply {
                                            put("frameId", frame.frameId)
                                            put("uri", frame.uri)
                                            put("order", frame.order)
                                            put("mimeType", frame.mimeType)
                                        },
                                    )
                                }
                            },
                        )
                    },
                )
            }
        },
    )
}

private fun forgeScanProjectFromJson(json: JSONObject): ForgeScanProject {
    val ringsJson = json.getJSONArray("rings")
    val rings = (0 until ringsJson.length()).map { i ->
        val ringJson = ringsJson.getJSONObject(i)
        val framesJson = ringJson.getJSONArray("frames")
        val frames = (0 until framesJson.length()).map { j ->
            val frameJson = framesJson.getJSONObject(j)
            ForgeScanFrame(
                frameId = frameJson.getString("frameId"),
                uri = frameJson.getString("uri"),
                order = frameJson.getInt("order"),
                mimeType = frameJson.optString("mimeType", "image/jpeg"),
            )
        }
        ForgeScanRing(ringId = ringJson.getString("ringId"), label = ringJson.getString("label"), frames = frames)
    }
    return ForgeScanProject(
        projectId = json.getString("projectId"),
        title = json.getString("title"),
        createdAt = json.getString("createdAt"),
        updatedAt = json.getString("updatedAt"),
        rings = rings,
    )
}
