package com.forgescan.mobile

import android.graphics.Bitmap

// Canonical internal mesh representation that carving/meshing produce and
// that every export writer (GLB, OBJ) targets, so format-specific code never
// needs to know anything about voxel carving or marching cubes internals.
// `colors` is a coarse per-vertex average (one flat color per face corner,
// the tile's own average) kept only as a fallback for formats/paths that
// can't carry a texture; `uvs` + `atlas` are the real per-face baked texture
// - see TextureBaker.kt.
data class ForgeScanMesh(
    val positions: FloatArray,
    val normals: FloatArray,
    val colors: FloatArray,
    val indices: IntArray,
    val uvs: FloatArray,
    val atlas: Bitmap,
) {
    override fun equals(other: Any?): Boolean = this === other
    override fun hashCode(): Int = System.identityHashCode(this)
}
