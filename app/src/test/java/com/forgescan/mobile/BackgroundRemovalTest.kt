package com.forgescan.mobile

import org.junit.Assert.assertEquals
import org.junit.Test

// Validates correctConfidenceAgainstBackgroundPlate's two correction
// directions independently before trusting it on real captures - the same
// prove-the-instrument-first pattern used elsewhere tonight. Colors are
// plain opaque ARGB ints; only their RGB channels matter to colorsClose.
class BackgroundRemovalTest {

    private val backgroundGray = 0xFF808080.toInt()
    private val foregroundRed = 0xFFCC2222.toInt()

    @Test
    fun `ambiguous confidence matching background is pushed to background`() {
        val pixels = intArrayOf(backgroundGray)
        val confidence = floatArrayOf(0.5f) // inside AmbiguousLow..AmbiguousHigh
        val plate = intArrayOf(backgroundGray)

        val corrected = correctConfidenceAgainstBackgroundPlate(pixels, confidence, plate)

        assertEquals(0f, corrected[0], 1e-6f)
    }

    @Test
    fun `ambiguous confidence NOT matching background is left alone`() {
        val pixels = intArrayOf(foregroundRed)
        val confidence = floatArrayOf(0.5f)
        val plate = intArrayOf(backgroundGray)

        val corrected = correctConfidenceAgainstBackgroundPlate(pixels, confidence, plate)

        assertEquals(0.5f, corrected[0], 1e-6f)
    }

    @Test
    fun `confidently-background prediction contradicted by color is rescued to foreground`() {
        // The exact failure mode found on a real capture: ML Kit says
        // "definitely background" (low confidence) for a pixel that looks
        // nothing like the ring's own modeled background - e.g. a rock
        // mount or a body region it mis-classified.
        val pixels = intArrayOf(foregroundRed)
        val confidence = floatArrayOf(0.05f) // confidently background, below AmbiguousLow
        val plate = intArrayOf(backgroundGray)

        val corrected = correctConfidenceAgainstBackgroundPlate(pixels, confidence, plate)

        assertEquals(1f, corrected[0], 1e-6f)
    }

    @Test
    fun `confidently-background prediction that genuinely matches background is left alone`() {
        val pixels = intArrayOf(backgroundGray)
        val confidence = floatArrayOf(0.05f)
        val plate = intArrayOf(backgroundGray)

        val corrected = correctConfidenceAgainstBackgroundPlate(pixels, confidence, plate)

        assertEquals(0.05f, corrected[0], 1e-6f)
    }

    @Test
    fun `confidently-foreground prediction is never touched either way`() {
        val pixels = intArrayOf(backgroundGray, foregroundRed)
        val confidence = floatArrayOf(0.95f, 0.95f)
        val plate = intArrayOf(backgroundGray, backgroundGray)

        val corrected = correctConfidenceAgainstBackgroundPlate(pixels, confidence, plate)

        assertEquals(0.95f, corrected[0], 1e-6f)
        assertEquals(0.95f, corrected[1], 1e-6f)
    }
}
