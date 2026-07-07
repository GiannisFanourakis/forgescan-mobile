package com.forgescan.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GaussianSplatExporterTest {

    @Test
    fun `loop closure exactly cancels a constant per-segment bias`() {
        val trueSegments = listOf(20.0, 25.0, 15.0, 30.0, 40.0, 35.0, 45.0, 50.0, 25.0, 35.0, 20.0, 20.0)
        assertEquals(360.0, trueSegments.sum(), 1e-9)

        val bias = 1.7
        val measuredSegments = trueSegments.map { it + bias }
        val corrected = applyLoopClosure(measuredSegments, 360.0)

        var trueCumulative = 0.0
        for (i in trueSegments.indices) {
            trueCumulative += trueSegments[i]
            assertEquals("keyframe $i should match the true cumulative angle, not just the final total", trueCumulative, corrected[i], 1e-9)
        }
        assertEquals(360.0, corrected.last(), 1e-9)
    }

    @Test
    fun `loop closure leaves an already-correct chain unchanged`() {
        val segments = listOf(90.0, 90.0, 90.0, 90.0)
        val corrected = applyLoopClosure(segments, 360.0)
        assertEquals(listOf(90.0, 180.0, 270.0, 360.0), corrected)
    }

    @Test
    fun `look-at matrix is orthonormal with correct handedness`() {
        val m = buildLookAtCameraToWorld(Vec3(3.0, 1.0, 0.5), Vec3(0.0, 0.0, 0.0), Vec3(0.0, 1.0, 0.0))
        val right = Vec3(m[0][0], m[1][0], m[2][0])
        val up = Vec3(m[0][1], m[1][1], m[2][1])
        val back = Vec3(m[0][2], m[1][2], m[2][2])

        assertEquals(1.0, right.length(), 1e-9)
        assertEquals(1.0, up.length(), 1e-9)
        assertEquals(1.0, back.length(), 1e-9)
        assertEquals(0.0, right.dot(up), 1e-9)
        assertEquals(0.0, up.dot(back), 1e-9)
        assertEquals(0.0, right.dot(back), 1e-9)

        // Right-handed, camera looking down -Z: right x up = back.
        val cross = right.cross(up)
        assertEquals(back.x, cross.x, 1e-9)
        assertEquals(back.y, cross.y, 1e-9)
        assertEquals(back.z, cross.z, 1e-9)
    }

    @Test
    fun `look-at matrix guards the near-degenerate straight-down elevation case`() {
        // Camera directly above the target: forward is parallel to the
        // default +Y up hint, which is exactly the case buildLookAtCameraToWorld
        // needs to fall back to a different hint axis for.
        val m = buildLookAtCameraToWorld(Vec3(0.0, 5.0, 0.0), Vec3(0.0, 0.0, 0.0), Vec3(0.0, 1.0, 0.0))
        val right = Vec3(m[0][0], m[1][0], m[2][0])
        val up = Vec3(m[0][1], m[1][1], m[2][1])
        assertTrue("right vector must not collapse to zero", right.length() > 0.5)
        assertEquals(0.0, right.dot(up), 1e-9)
    }

    @Test
    fun `tail frames beyond the last measured keyframe all receive interpolated angles`() {
        // Mirrors measureRingPairs' own stride loop stopping short of the
        // last frame: keyframes at 3 and 6 out of 10 frames, with a final
        // tail segment extrapolated out to frame 9 (frameCount - 1).
        val keyframeIndices = listOf(3, 6, 9)
        val keyframeAngles = listOf(108.0, 216.0, 324.0)
        val totalFrames = 10

        val perFrame = interpolateKeyframeAngles(keyframeIndices, keyframeAngles, totalFrames)

        assertEquals(totalFrames, perFrame.size)
        assertEquals(0.0, perFrame[0], 1e-9)
        for (i in 1 until totalFrames) {
            assertTrue("frame $i's angle must exceed frame ${i - 1}'s", perFrame[i] > perFrame[i - 1])
        }
        // The tail frames (7, 8, 9) are the ones the reverted experiment's
        // own loop would have left unmeasured - confirm they interpolate
        // smoothly between the last two keyframes rather than being stuck.
        assertEquals(216.0, perFrame[6], 1e-9)
        assertEquals(324.0, perFrame[9], 1e-9)
        assertTrue(perFrame[7] in 216.0..324.0)
        assertTrue(perFrame[8] in 216.0..324.0)
    }
}
