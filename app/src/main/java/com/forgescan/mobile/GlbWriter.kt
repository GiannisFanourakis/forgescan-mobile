package com.forgescan.mobile

import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.json.JSONArray
import org.json.JSONObject

private const val GlbMagic = 0x46546C67
private const val GlbVersion = 2
private const val ChunkTypeJson = 0x4E4F534A
private const val ChunkTypeBin = 0x004E4942

// Hand-rolled binary glTF (.glb) writer tailored to exactly the one mesh
// shape this pipeline produces (positions, normals, per-vertex color, UVs,
// indices). Color travels as a COLOR_0 vertex attribute, barycentric-
// interpolated directly by the rasterizer, rather than as a baseColorTexture
// referencing the UV-mapped atlas MeshColorizer.kt bakes (that atlas is real,
// and used both by the OBJ export's map_Kd texture and by MeshPreviewScreen's
// own manually-bound Filament Texture). This app's actual SceneView/Filament
// build logs "Missing texture provider for image/png" and never binds
// embedded PNG textures via glTF's baseColorTexture, regardless of glTF-side
// correctness (verified against Filament 1.71.5's own source and decompiled
// bytecode - the Java ResourceLoader constructor unconditionally registers
// an STB provider for image/png, yet the registration provably isn't taking
// effect at runtime here). COLOR_0 sidesteps that gap entirely for a
// reliable fallback appearance; TEXCOORD_0 is still included so
// MeshPreviewScreen can bind its own manually-loaded texture on top (that
// path needs real UV data even though this writer never references an
// embedded image itself).
fun writeGlb(mesh: ForgeScanMesh, outputFile: File) {
    val bin = ByteArrayOutputStream()
    fun align4() { while (bin.size() % 4 != 0) bin.write(0) }

    val positionsOffset = bin.size()
    writeFloats(bin, mesh.positions)
    align4()
    val normalsOffset = bin.size()
    writeFloats(bin, mesh.normals)
    align4()
    val colorsOffset = bin.size()
    writeFloats(bin, mesh.colors)
    align4()
    val uvsOffset = bin.size()
    writeFloats(bin, mesh.uvs)
    align4()
    val indicesOffset = bin.size()
    writeUInts(bin, mesh.indices)
    align4()
    val binBytes = bin.toByteArray()

    val vertexCount = mesh.positions.size / 3
    val (minPos, maxPos) = boundsOf(mesh.positions)

    val json = JSONObject().apply {
        put("asset", JSONObject().apply { put("version", "2.0"); put("generator", "ForgeScan") })
        put("scene", 0)
        put("scenes", JSONArray().put(JSONObject().apply { put("nodes", JSONArray().put(0)) }))
        put("nodes", JSONArray().put(JSONObject().apply { put("mesh", 0) }))
        put(
            "meshes",
            JSONArray().put(
                JSONObject().apply {
                    put(
                        "primitives",
                        JSONArray().put(
                            JSONObject().apply {
                                put(
                                    "attributes",
                                    JSONObject().apply {
                                        put("POSITION", 0)
                                        put("NORMAL", 1)
                                        put("COLOR_0", 2)
                                        put("TEXCOORD_0", 3)
                                    },
                                )
                                put("indices", 4)
                                put("mode", 4)
                                put("material", 0)
                            },
                        ),
                    )
                },
            ),
        )
        put(
            "materials",
            JSONArray().put(
                JSONObject().apply {
                    // baseColorFactor stays neutral white so COLOR_0 passes
                    // through unmodified once the renderer multiplies it in
                    // per the glTF spec.
                    put(
                        "pbrMetallicRoughness",
                        JSONObject().apply {
                            put("baseColorFactor", JSONArray().put(1.0).put(1.0).put(1.0).put(1.0))
                            put("metallicFactor", 0.0)
                            put("roughnessFactor", 0.9)
                        },
                    )
                },
            ),
        )
        put(
            "accessors",
            JSONArray().apply {
                put(
                    JSONObject().apply {
                        put("bufferView", 0); put("componentType", 5126); put("count", vertexCount); put("type", "VEC3")
                        put("min", JSONArray().put(minPos[0].toDouble()).put(minPos[1].toDouble()).put(minPos[2].toDouble()))
                        put("max", JSONArray().put(maxPos[0].toDouble()).put(maxPos[1].toDouble()).put(maxPos[2].toDouble()))
                    },
                )
                put(JSONObject().apply { put("bufferView", 1); put("componentType", 5126); put("count", vertexCount); put("type", "VEC3") })
                put(JSONObject().apply { put("bufferView", 2); put("componentType", 5126); put("count", vertexCount); put("type", "VEC3") })
                put(JSONObject().apply { put("bufferView", 3); put("componentType", 5126); put("count", vertexCount); put("type", "VEC2") })
                put(JSONObject().apply { put("bufferView", 4); put("componentType", 5125); put("count", mesh.indices.size); put("type", "SCALAR") })
            },
        )
        put(
            "bufferViews",
            JSONArray().apply {
                put(JSONObject().apply { put("buffer", 0); put("byteOffset", positionsOffset); put("byteLength", mesh.positions.size * 4) })
                put(JSONObject().apply { put("buffer", 0); put("byteOffset", normalsOffset); put("byteLength", mesh.normals.size * 4) })
                put(JSONObject().apply { put("buffer", 0); put("byteOffset", colorsOffset); put("byteLength", mesh.colors.size * 4) })
                put(JSONObject().apply { put("buffer", 0); put("byteOffset", uvsOffset); put("byteLength", mesh.uvs.size * 4) })
                put(JSONObject().apply { put("buffer", 0); put("byteOffset", indicesOffset); put("byteLength", mesh.indices.size * 4) })
            },
        )
        put("buffers", JSONArray().put(JSONObject().apply { put("byteLength", binBytes.size) }))
    }

    var jsonBytes = json.toString().toByteArray(Charsets.UTF_8)
    val jsonPadding = (4 - jsonBytes.size % 4) % 4
    if (jsonPadding > 0) {
        jsonBytes = ByteArray(jsonBytes.size + jsonPadding) { if (it < jsonBytes.size) jsonBytes[it] else 0x20 }
    }

    val totalLength = 12 + 8 + jsonBytes.size + 8 + binBytes.size
    outputFile.outputStream().use { out ->
        val header = ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN)
        header.putInt(GlbMagic); header.putInt(GlbVersion); header.putInt(totalLength)
        out.write(header.array())

        val jsonChunkHeader = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
        jsonChunkHeader.putInt(jsonBytes.size); jsonChunkHeader.putInt(ChunkTypeJson)
        out.write(jsonChunkHeader.array())
        out.write(jsonBytes)

        val binChunkHeader = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
        binChunkHeader.putInt(binBytes.size); binChunkHeader.putInt(ChunkTypeBin)
        out.write(binChunkHeader.array())
        out.write(binBytes)
    }
}

private fun writeFloats(stream: ByteArrayOutputStream, values: FloatArray) {
    val buffer = ByteBuffer.allocate(values.size * 4).order(ByteOrder.LITTLE_ENDIAN)
    values.forEach { buffer.putFloat(it) }
    stream.write(buffer.array())
}

private fun writeUInts(stream: ByteArrayOutputStream, values: IntArray) {
    val buffer = ByteBuffer.allocate(values.size * 4).order(ByteOrder.LITTLE_ENDIAN)
    values.forEach { buffer.putInt(it) }
    stream.write(buffer.array())
}

private fun boundsOf(positions: FloatArray): Pair<FloatArray, FloatArray> {
    val min = floatArrayOf(Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE)
    val max = floatArrayOf(-Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE)
    var i = 0
    while (i < positions.size) {
        for (axis in 0..2) {
            val value = positions[i + axis]
            if (value < min[axis]) min[axis] = value
            if (value > max[axis]) max[axis] = value
        }
        i += 3
    }
    return min to max
}
