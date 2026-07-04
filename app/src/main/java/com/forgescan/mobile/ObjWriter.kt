package com.forgescan.mobile

import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

// OBJ is inherently multi-file (.obj + .mtl [+ textures]), so it is always
// auto-zipped into a single artifact rather than left as a loose folder.
fun writeObjZip(mesh: ForgeScanMesh, outputZipFile: File, baseName: String = "model") {
    val vertexCount = mesh.positions.size / 3
    val objText = buildString {
        appendLine("mtllib $baseName.mtl")
        appendLine("o ForgeScanMesh")
        for (v in 0 until vertexCount) {
            val r = mesh.colors[v * 3]
            val g = mesh.colors[v * 3 + 1]
            val b = mesh.colors[v * 3 + 2]
            appendLine("v ${mesh.positions[v * 3]} ${mesh.positions[v * 3 + 1]} ${mesh.positions[v * 3 + 2]} $r $g $b")
        }
        for (v in 0 until vertexCount) {
            appendLine("vn ${mesh.normals[v * 3]} ${mesh.normals[v * 3 + 1]} ${mesh.normals[v * 3 + 2]}")
        }
        appendLine("usemtl material0")
        var i = 0
        while (i < mesh.indices.size) {
            val a = mesh.indices[i] + 1
            val b = mesh.indices[i + 1] + 1
            val c = mesh.indices[i + 2] + 1
            appendLine("f $a//$a $b//$b $c//$c")
            i += 3
        }
    }
    val mtlText = buildString {
        appendLine("newmtl material0")
        appendLine("Kd 1.0 1.0 1.0")
        appendLine("Ka 0.0 0.0 0.0")
    }

    ZipOutputStream(outputZipFile.outputStream()).use { zip ->
        zip.putNextEntry(ZipEntry("$baseName.obj"))
        zip.write(objText.toByteArray())
        zip.closeEntry()
        zip.putNextEntry(ZipEntry("$baseName.mtl"))
        zip.write(mtlText.toByteArray())
        zip.closeEntry()
    }
}
