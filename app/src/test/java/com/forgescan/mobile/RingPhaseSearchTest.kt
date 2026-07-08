package com.forgescan.mobile

import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Validates the silhouette-coherence phase search against synthetic ground
// truth before it's trusted on real captures - the same
// prove-the-instrument-first pattern used for the pose/scale/billboard
// diagnostic scripts. Silhouettes are rendered analytically (orthographic
// back-projection against exact spheres, using the same projection basis
// sampleSilhouette consumes), so the true phase offset is known by
// construction.
class RingPhaseSearchTest {

    // Solid = list of spheres, each (cx, cy, cz, radius). A pixel is inside
    // the silhouette iff its orthographic view ray passes within radius of
    // some sphere center - exact, no rasterization approximation.
    private fun synthesizeRing(
        frameCount: Int,
        elevationDegrees: Float,
        truePhaseDegrees: Float,
        silhouetteGrid: Int,
        spheres: List<FloatArray>,
        halfExtent: Float = 0.7f,
    ): RingSilhouettes {
        val trueProjections = buildRingProjections(frameCount, elevationDegrees, truePhaseDegrees)
        val silhouettes = trueProjections.map { p ->
            // View direction = U x V (the axis the orthographic projection
            // collapses; sign is irrelevant for a symmetric-in-t ray test).
            val wx = p.uy * p.vz - p.uz * p.vy
            val wy = p.uz * p.vx - p.ux * p.vz
            val wz = p.ux * p.vy - p.uy * p.vx
            val arr = BooleanArray(silhouetteGrid * silhouetteGrid)
            for (py in 0 until silhouetteGrid) {
                // Inverse of sampleSilhouette's v -> gy mapping, at pixel center.
                val v = 1f - 2f * (py + 0.5f) / silhouetteGrid
                for (px in 0 until silhouetteGrid) {
                    val u = (px + 0.5f) / silhouetteGrid * 2f - 1f
                    val rawU = u / halfExtent
                    val rawV = v / halfExtent
                    val p0x = rawU * p.ux + rawV * p.vx
                    val p0y = rawU * p.uy + rawV * p.vy
                    val p0z = rawU * p.uz + rawV * p.vz
                    var on = false
                    for (s in spheres) {
                        val dx = s[0] - p0x
                        val dy = s[1] - p0y
                        val dz = s[2] - p0z
                        val t = dx * wx + dy * wy + dz * wz
                        val qx = dx - t * wx
                        val qy = dy - t * wy
                        val qz = dz - t * wz
                        if (qx * qx + qy * qy + qz * qz <= s[3] * s[3]) {
                            on = true
                            break
                        }
                    }
                    arr[py * silhouetteGrid + px] = on
                }
            }
            arr
        }
        // The returned object carries phase-0 projections: ring A's are used
        // directly by the search's own carve, and ring B's are rebuilt per
        // candidate anyway - only the silhouette CONTENT encodes truePhase.
        return RingSilhouettes(
            "synthetic",
            buildRingProjections(frameCount, elevationDegrees, 0f),
            silhouettes,
            silhouetteGrid,
            centerU = 0f,
            centerV = 0f,
            halfExtent = halfExtent,
        )
    }

    private val asymmetricSolid = listOf(
        floatArrayOf(0f, 0f, 0f, 0.45f), // main body
        floatArrayOf(0.45f, 0.05f, 0f, 0.28f), // off-axis bump - the "beak"
    )
    private val symmetricSolid = listOf(
        floatArrayOf(0f, 0f, 0f, 0.45f),
    )

    @Test
    fun `recovers a known phase offset between two elevations`() {
        val truePhase = 137f
        val ringA = synthesizeRing(36, elevationDegrees = 5f, truePhaseDegrees = 0f, silhouetteGrid = 96, spheres = asymmetricSolid)
        val ringB = synthesizeRing(36, elevationDegrees = 50f, truePhaseDegrees = truePhase, silhouetteGrid = 96, spheres = asymmetricSolid)

        val logs = ArrayList<String>()
        val result = searchPhaseOffset(ringA, ringB, elevationBDegrees = 50f) { logs += it }

        assertNotNull("search should find the offset; logs:\n${logs.joinToString("\n")}", result)
        val error = angularDifferenceDegrees(result!!.azimuthPhaseOffsetDegrees, truePhase.toDouble())
        assertTrue("recovered ${result.azimuthPhaseOffsetDegrees} deg, want ~$truePhase deg (error $error); logs:\n${logs.joinToString("\n")}", error <= 3.0)
    }

    @Test
    fun `recovers a near-zero offset across the wraparound`() {
        val truePhase = 2f
        val ringA = synthesizeRing(36, elevationDegrees = 5f, truePhaseDegrees = 0f, silhouetteGrid = 96, spheres = asymmetricSolid)
        val ringB = synthesizeRing(36, elevationDegrees = 50f, truePhaseDegrees = truePhase, silhouetteGrid = 96, spheres = asymmetricSolid)

        val result = searchPhaseOffset(ringA, ringB, elevationBDegrees = 50f)

        assertNotNull(result)
        val error = angularDifferenceDegrees(result!!.azimuthPhaseOffsetDegrees, truePhase.toDouble())
        assertTrue("recovered ${result.azimuthPhaseOffsetDegrees} deg, want ~$truePhase deg (error $error)", error <= 3.0)
    }

    @Test
    fun `recovers phase and vertical offset jointly when ring B sits lower`() {
        // Mirrors the real failure this dimension was added for: each ring
        // normalizes to its own bbox, so the same object can sit at
        // different heights in the two rings' normalized frames. Bake a
        // vertical shift into ring B's silhouette content by moving the
        // solid itself.
        val truePhase = 137f
        val trueShift = 0.15f
        val shiftedSolid = asymmetricSolid.map { s -> floatArrayOf(s[0], s[1] + trueShift, s[2], s[3]) }
        val ringA = synthesizeRing(36, elevationDegrees = 5f, truePhaseDegrees = 0f, silhouetteGrid = 96, spheres = asymmetricSolid)
        val ringB = synthesizeRing(36, elevationDegrees = 50f, truePhaseDegrees = truePhase, silhouetteGrid = 96, spheres = shiftedSolid)

        val logs = ArrayList<String>()
        val result = searchPhaseOffset(ringA, ringB, elevationBDegrees = 50f) { logs += it }

        assertNotNull("search should solve phase and height together; logs:\n${logs.joinToString("\n")}", result)
        val phaseError = angularDifferenceDegrees(result!!.azimuthPhaseOffsetDegrees, truePhase.toDouble())
        assertTrue("recovered phase ${result.azimuthPhaseOffsetDegrees}, want ~$truePhase (error $phaseError)", phaseError <= 3.0)
        // Ring B's content sits trueShift HIGHER, so sampling ring B for a
        // ring-A voxel must shift by +trueShift to land on it.
        val dyError = kotlin.math.abs(result.verticalOffsetWorld - trueShift)
        assertTrue("recovered dy ${result.verticalOffsetWorld}, want ~$trueShift (error $dyError)", dyError <= 0.06)
    }

    @Test
    fun `refuses to pick an offset for a rotationally symmetric object`() {
        val ringA = synthesizeRing(36, elevationDegrees = 5f, truePhaseDegrees = 0f, silhouetteGrid = 96, spheres = symmetricSolid)
        val ringB = synthesizeRing(36, elevationDegrees = 50f, truePhaseDegrees = 211f, silhouetteGrid = 96, spheres = symmetricSolid)

        val logs = ArrayList<String>()
        val result = searchPhaseOffset(ringA, ringB, elevationBDegrees = 50f) { logs += it }

        assertNull("a flat score curve must produce an honest null, not its noise maximum; logs:\n${logs.joinToString("\n")}", result)
    }
}
