package com.forgescan.mobile

import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RingRegistrationTest {

    @Test
    fun `angular difference handles wraparound correctly`() {
        assertEquals(20.0, angularDifferenceDegrees(350.0, 10.0), 1e-9)
        assertEquals(0.0, angularDifferenceDegrees(0.0, 360.0), 1e-9)
        assertEquals(180.0, angularDifferenceDegrees(0.0, 180.0), 1e-9)
    }

    @Test
    fun `normalizeDegrees wraps negative and large values into 0-360`() {
        assertEquals(350.0, normalizeDegrees(-10.0), 1e-9)
        assertEquals(10.0, normalizeDegrees(370.0), 1e-9)
        assertEquals(0.0, normalizeDegrees(360.0), 1e-9)
    }

    // Forward-model the exact same "angle between two camera directions on a
    // sphere" relationship solveAzimuthPhaseCandidates inverts, then confirm
    // one of the two returned candidates round-trips back to the true phase -
    // this is the core geometric assumption the whole registration function
    // rests on, so it needs to be checked both ways, not just trusted.
    private fun angleBetweenDirections(elevationADeg: Double, thetaADeg: Double, elevationBDeg: Double, thetaBDeg: Double): Double {
        val eA = Math.toRadians(elevationADeg)
        val eB = Math.toRadians(elevationBDeg)
        val tA = Math.toRadians(thetaADeg)
        val tB = Math.toRadians(thetaBDeg)
        val dot = cos(eA) * cos(eB) * cos(tA - tB) + sin(eA) * sin(eB)
        return acos(dot.coerceIn(-1.0, 1.0))
    }

    @Test
    fun `solveAzimuthPhaseCandidates recovers the true phase offset as one of its two candidates`() {
        val elevationA = 15.0
        val elevationB = 55.0
        val thetaA = 40.0
        val thetaB = 130.0
        val truePhase = 77.0 // ring B's frame-0 reference is offset by this much from ring A's

        // thetaB is measured in ring B's own frame; its position relative to
        // ring A's frame is (thetaB + truePhase).
        val measuredAngle = angleBetweenDirections(elevationA, thetaA, elevationB, thetaB + truePhase)

        val candidates = solveAzimuthPhaseCandidates(elevationA, thetaA, elevationB, thetaB, measuredAngle)
        assertNotNull(candidates)
        val matchesTruth = candidates!!.any { angularDifferenceDegrees(it, truePhase) < 1e-6 }
        assertTrue("expected one candidate near $truePhase, got $candidates", matchesTruth)
    }

    @Test
    fun `solveAzimuthPhaseCandidates rejects a geometrically impossible angle`() {
        // At these elevations the max possible angle between camera directions
        // is well under 180 degrees - feed in an angle that can't correspond
        // to any real relative azimuth and confirm it's rejected, not forced.
        val result = solveAzimuthPhaseCandidates(0.0, 0.0, 0.0, 0.0, Math.toRadians(179.9))
        // At elevation 0/0, k = cos(angle), which is always in [-1,1] - use a
        // case where cosEA/cosEB shrink the achievable range instead.
        val result2 = solveAzimuthPhaseCandidates(80.0, 0.0, 80.0, 0.0, Math.toRadians(90.0))
        assertNull(result2)
        assertNotNull(result) // sanity: the 0/0 case is not itself degenerate
    }

    @Test
    fun `clusterPhaseSolutions requires agreement from distinct pairs, not just many candidates from one pair`() {
        // Two pairs whose candidates happen to include a near-match by
        // coincidence, but only ONE distinct pair actually supports it -
        // should NOT form an accepted cluster at minDistinctPairs=2.
        val single = listOf(0 to listOf(10.0, 200.0))
        assertNull(clusterPhaseSolutions(single, toleranceDegrees = 5.0, minDistinctPairs = 2))

        // Three distinct pairs converging near 45 degrees (with noise) plus
        // one outlier pair - the real cluster should win.
        val converging = listOf(
            0 to listOf(44.0, 210.0),
            1 to listOf(46.0, 300.0),
            2 to listOf(45.5, 100.0),
            3 to listOf(170.0, 350.0), // outlier pair, no candidate near 45
        )
        val result = clusterPhaseSolutions(converging, toleranceDegrees = 5.0, minDistinctPairs = 2)
        assertNotNull(result)
        val (median, residual, support) = result!!
        assertEquals(45.0, median, 2.0)
        assertTrue(residual < 5.0)
        assertEquals(3, support)
    }

    @Test
    fun `clusterPhaseSolutions returns null when nothing agrees`() {
        val scattered = listOf(0 to listOf(10.0, 190.0), 1 to listOf(80.0, 260.0), 2 to listOf(150.0, 330.0))
        assertNull(clusterPhaseSolutions(scattered, toleranceDegrees = 5.0, minDistinctPairs = 2))
    }
}
