package com.forgescan.mobile

// Canonical internal mesh representation that carving/meshing produce and
// that every export writer (GLB, OBJ) targets, so format-specific code never
// needs to know anything about voxel carving or marching cubes internals.
data class ForgeScanMesh(
    val positions: FloatArray,
    val normals: FloatArray,
    val colors: FloatArray,
    val indices: IntArray,
) {
    override fun equals(other: Any?): Boolean = this === other
    override fun hashCode(): Int = System.identityHashCode(this)
}
