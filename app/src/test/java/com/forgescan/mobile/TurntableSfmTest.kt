package com.forgescan.mobile

import org.junit.Assert.assertEquals
import org.junit.Test

class TurntableSfmTest {

    @Test
    fun `focal length is invariant to whether the frame is labeled portrait or landscape`() {
        // Same physical frame, described the other way around - a lens's
        // focal length is one physical property of the lens+sensor pair, so
        // it must not change depending on which pixel dimension happens to
        // be larger. This is the exact invariant the original bug violated:
        // applying AssumedHorizontalFovDegrees to whatever was labeled
        // "width" silently assumed width was always the wide axis.
        val portrait = estimateFocalLengthPixels(width = 788, height = 1400)
        val landscape = estimateFocalLengthPixels(width = 1400, height = 788)
        assertEquals(portrait, landscape, 1e-9)
    }

    @Test
    fun `focal length matches the direct formula against the wide axis`() {
        val expected = 1400.0 / (2.0 * kotlin.math.tan(Math.toRadians(AssumedHorizontalFovDegrees / 2.0)))
        assertEquals(expected, estimateFocalLengthPixels(788, 1400), 1e-9)
        assertEquals(expected, estimateFocalLengthPixels(1400, 788), 1e-9)
    }
}
