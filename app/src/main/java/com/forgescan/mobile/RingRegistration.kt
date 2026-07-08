package com.forgescan.mobile

import android.content.Context
import android.util.Log
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.sin
import org.opencv.calib3d.Calib3d
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point

// Detects whether two of a project's rings observe the SAME physical
// turntable session closely enough to be fused into one Gaussian-splat
// export, by reusing exactly the masked-ORB + essential-matrix machinery
// TurntableSfm.kt already uses for within-ring pairs - just applied ACROSS
// two rings' frames instead of between frames of the same ring. There is no
// separate "detection" heuristic: a ring pair's success/failure signal IS
// the registration attempt's own outcome.
//
// What a within-ring pair measures directly (a rotation angle, since both
// frames share the same known camera elevation) isn't available here - two
// different rings generally sit at two different, independently-measured
// elevations, so the one unknown a cross-ring match actually solves for is
// the RELATIVE AZIMUTH PHASE between the rings' independent zero-references
// (ring B's frame 0 was captured at some unknown rotational offset from ring
// A's frame 0 - different capture sessions have no reason to agree).

internal class RingRegistration(
    val ringAId: String,
    val ringBId: String,
    val azimuthPhaseOffsetDegrees: Double,
    val verticalOffset: Double,
    val pairsAttempted: Int,
    val pairsSucceeded: Int,
    val phaseResidualDegrees: Double,
    // True when verticalOffset came from real silhouette-hull agreement
    // (RingPhaseSearch.kt - safe to feed into carving), false when it's only
    // this file's coarse sin(eA)-sin(eB) elevation-gap approximation - good
    // enough for GS export's forgiving photometric refinement, never
    // validated for carving's precision needs. registerRingsRobust
    // (RingPhaseSearch.kt) re-measures this whenever the feature path below
    // succeeds, rather than trusting the approximation for carving.
    val verticalOffsetMeasured: Boolean = false,
)

// The relative azimuth phase between two independently-started recordings
// of the same continuously-spinning turntable is a real but UNKNOWN offset
// even when nothing but the camera moved between them - the turntable kept
// turning during however long that repositioning took. There's no reason
// ring A's k-th sampled frame corresponds in rotation to ring B's k-th
// sampled frame, so searching only that diagonal (the original version of
// this) mostly misses the real corresponding frames unless the phase
// happens to be small by chance. Sampling MaxCrossRingSamplesPerRing frames
// from each ring and trying every combination (a full grid, not a diagonal)
// is what actually searches for an unknown phase.
private const val MaxCrossRingSamplesPerRing = 8
private const val MinSuccessfulCrossRingPairs = 2

// How tightly independently-solved phase candidates must agree to be
// trusted as "the same real offset" rather than coincidental matches -
// loose on purpose, for the same reason TurntableSfm.kt's own per-pair
// angle-plausibility floor is loose: this is a net that rejects gross
// disagreement, not a mechanism that manufactures agreement by being tight
// enough to always find SOME cluster.
private const val MaxPhaseResidualDegrees = 20.0

private class CrossRingMatch(
    val angleRadians: Double,
    val inlierCount: Int,
)

// Attempts registration between two populated, masked rings. Returns null if
// too few candidate frame-pairs matched, or if the ones that did match
// couldn't agree with each other on a single relative azimuth phase -
// either way, "not registered" is the honest answer for a pair this
// under-evidenced, exactly like every other measurement gate built tonight.
internal fun registerRings(
    context: Context,
    projectId: String,
    ringA: ForgeScanRing,
    elevationADegrees: Double,
    ringB: ForgeScanRing,
    elevationBDegrees: Double,
): RingRegistration? {
    val framesA = ringA.frames.size
    val framesB = ringB.frames.size
    if (framesA == 0 || framesB == 0) return null

    val samplesPerRing = minOf(MaxCrossRingSamplesPerRing, framesA, framesB)
    if (samplesPerRing == 0) return null
    val strideA = maxOf(1, framesA / samplesPerRing)
    val strideB = maxOf(1, framesB / samplesPerRing)
    val samplesA = (0 until samplesPerRing).map { (it * strideA) % framesA }.distinct()
    val samplesB = (0 until samplesPerRing).map { (it * strideB) % framesB }.distinct()

    // Each successful pair yields TWO candidate phase solutions (a
    // clockwise/counterclockwise sign ambiguity inherent to solving one
    // angle against two known elevations - see solveAzimuthPhaseCandidates).
    // Keyed by pairIndex so the clustering step below can require agreement
    // from distinct PAIRS, not just multiple candidates from the same pair
    // (whose own two candidates are typically far apart, not near-duplicates).
    val candidatesByPair = ArrayList<Pair<Int, List<Double>>>()
    val verticalOffsets = ArrayList<Double>()
    var attempted = 0

    for (indexA in samplesA) {
        for (indexB in samplesB) {
            attempted++
            val match = attemptCrossRingPair(context, projectId, ringA, indexA, ringB, indexB)
            if (match == null) {
                Log.d("ForgeScan", "Ring registration (${ringA.ringId},${ringB.ringId}) pair ($indexA,$indexB): no usable match")
                continue
            }
            // Uniform-fallback azimuth within each ring for this solve,
            // matching what carving/GS export both already fall back to -
            // registration only needs a self-consistent RELATIVE phase
            // between the rings, not a precisely measured absolute azimuth
            // for either one.
            val thetaA = indexA.toDouble() / framesA * 360.0
            val thetaB = indexB.toDouble() / framesB * 360.0
            val candidates = solveAzimuthPhaseCandidates(elevationADegrees, thetaA, elevationBDegrees, thetaB, match.angleRadians)
            if (candidates == null) {
                Log.d(
                    "ForgeScan",
                    "Ring registration (${ringA.ringId},${ringB.ringId}) pair ($indexA,$indexB): matched " +
                        "(${match.inlierCount} inliers) but angle=${Math.toDegrees(match.angleRadians)} deg is geometrically " +
                        "implausible for elevations ($elevationADegrees,$elevationBDegrees) - stage=phase-solve",
                )
                continue
            }
            Log.d(
                "ForgeScan",
                "Ring registration (${ringA.ringId},${ringB.ringId}) pair ($indexA,$indexB): matched, inliers=${match.inlierCount}, " +
                    "recovered angle=${Math.toDegrees(match.angleRadians)} deg, phase candidates=$candidates",
            )
            candidatesByPair += candidatesByPair.size to candidates
            verticalOffsets += estimateVerticalOffset(elevationADegrees, elevationBDegrees)
        }
    }

    if (candidatesByPair.size < MinSuccessfulCrossRingPairs) {
        Log.d(
            "ForgeScan",
            "Ring registration (${ringA.ringId},${ringB.ringId}): only ${candidatesByPair.size}/$attempted candidate pair(s) " +
                "produced a usable measurement, need $MinSuccessfulCrossRingPairs - NOT registered",
        )
        return null
    }

    val cluster = clusterPhaseSolutions(candidatesByPair, MaxPhaseResidualDegrees, MinSuccessfulCrossRingPairs)
    if (cluster == null) {
        Log.d(
            "ForgeScan",
            "Ring registration (${ringA.ringId},${ringB.ringId}): ${candidatesByPair.size} pair(s) matched but their solved " +
                "phases never agreed within ${MaxPhaseResidualDegrees}deg - NOT registered",
        )
        return null
    }
    val (medianPhase, residual, supportCount) = cluster

    val sortedVertical = verticalOffsets.sorted()
    val medianVertical = sortedVertical[sortedVertical.size / 2]

    Log.i(
        "ForgeScan",
        "Ring registration (${ringA.ringId},${ringB.ringId}): SUCCESS - $supportCount/$attempted pairs agreed, " +
            "phase=$medianPhase deg (residual=$residual deg), verticalOffset=$medianVertical",
    )
    return RingRegistration(
        ringAId = ringA.ringId,
        ringBId = ringB.ringId,
        azimuthPhaseOffsetDegrees = medianPhase,
        verticalOffset = medianVertical,
        pairsAttempted = attempted,
        pairsSucceeded = supportCount,
        phaseResidualDegrees = residual,
    )
}

// Approximates the recovered inter-camera rotation angle as the angular
// separation between the two cameras' positions on the sphere they orbit -
// valid for a common-target/look-at camera model, which is what both
// carving's orthographic projection and the GS exporter's perspective model
// already assume. With both rings' elevations known, a single measured
// angle leaves exactly one unknown to solve for: the relative azimuth phase
// between the two rings' independent zero-references. Returns both sign
// solutions (a clockwise/counterclockwise ambiguity, same shape as the
// (axis,angle) ambiguity handled elsewhere in this codebase) - the caller's
// cross-pair clustering is what actually disambiguates, not this function.
internal fun solveAzimuthPhaseCandidates(
    elevationADegrees: Double,
    thetaADegrees: Double,
    elevationBDegrees: Double,
    thetaBDegrees: Double,
    measuredAngleRadians: Double,
): List<Double>? {
    val elevationA = Math.toRadians(elevationADegrees)
    val elevationB = Math.toRadians(elevationBDegrees)
    val cosEA = cos(elevationA)
    val cosEB = cos(elevationB)
    if (abs(cosEA) < 1e-6 || abs(cosEB) < 1e-6) return null
    val k = (cos(measuredAngleRadians) - sin(elevationA) * sin(elevationB)) / (cosEA * cosEB)
    if (k < -1.0 || k > 1.0) return null
    val delta = Math.toDegrees(acos(k))
    return listOf(
        normalizeDegrees(thetaADegrees - thetaBDegrees - delta),
        normalizeDegrees(thetaADegrees - thetaBDegrees + delta),
    )
}

// Coarse approximation, not a rigorously triangulated offset: since both
// rings independently normalize their own points by "median body radius =
// 1" (buildSeedPointCloud), the main systematic vertical difference between
// their reconstructions comes from where each ring's own per-pair
// normalization anchors relative to the shared object center at its own
// elevation, not from a precisely recovered relative translation (monocular
// two-view triangulation has no absolute scale to recover one from without
// substantially more work). Good enough to seed a fused point cloud without
// a visible split between the two rings' contributions - not a claim of
// precise alignment.
internal fun estimateVerticalOffset(elevationADegrees: Double, elevationBDegrees: Double): Double {
    val elevationA = Math.toRadians(elevationADegrees)
    val elevationB = Math.toRadians(elevationBDegrees)
    return sin(elevationA) - sin(elevationB)
}

internal fun normalizeDegrees(degrees: Double): Double {
    var d = degrees % 360.0
    if (d < 0) d += 360.0
    return d
}

internal fun angularDifferenceDegrees(a: Double, b: Double): Double {
    val diff = abs(normalizeDegrees(a) - normalizeDegrees(b))
    return minOf(diff, 360.0 - diff)
}

// Greedy clustering over the (typically far-apart) sign-ambiguous candidate
// pairs: for every candidate as a trial cluster center, gather the closest
// candidate from every OTHER pair within tolerance (at most one per pair, so
// a single pair's own two candidates can't both count as "support"), then
// keep the largest such cluster. Requires support from minDistinctPairs
// distinct pairs, not just densely-sampled candidates from the same one or
// two pairs.
internal fun clusterPhaseSolutions(
    candidatesByPair: List<Pair<Int, List<Double>>>,
    toleranceDegrees: Double,
    minDistinctPairs: Int,
): Triple<Double, Double, Int>? {
    val flat = candidatesByPair.flatMap { (pairIndex, candidates) -> candidates.map { pairIndex to it } }
    var best: Triple<Double, Double, Int>? = null
    for ((_, center) in flat) {
        val supportByPair = HashMap<Int, Double>()
        for ((pairIndex, value) in flat) {
            val diff = angularDifferenceDegrees(value, center)
            if (diff > toleranceDegrees) continue
            val existing = supportByPair[pairIndex]
            if (existing == null || angularDifferenceDegrees(existing, center) > diff) {
                supportByPair[pairIndex] = value
            }
        }
        if (supportByPair.size < minDistinctPairs) continue
        val values = supportByPair.values.sorted()
        val median = values[values.size / 2]
        val residual = values.maxOf { angularDifferenceDegrees(it, median) }
        val current = best
        if (current == null || supportByPair.size > current.third) {
            best = Triple(median, residual, supportByPair.size)
        }
    }
    return best
}

// Learned-matcher counterpart of TurntableSfm.kt's attemptMeasurePair
// (LearnedMatcher.kt's SuperPoint+LightGlue pipeline instead of masked ORB +
// BFMatcher, everything downstream of matching - disparity filter, essential
// matrix, recoverPose, axis+angle extraction - unchanged). ORB was tried
// here first and replaced: cross-ring frames span a much larger viewpoint
// change than within-ring consecutive frames (a large elevation gap between
// rings is the NORMAL case, not an edge case - rings are deliberately
// captured far apart in elevation for hull coverage), and ORB's hand-crafted
// descriptor collapses under exactly that change. Confirmed on a real
// capture: ORB found a usable match in only 4/64 sampled pairs (3
// geometrically impossible), while this matcher found many more raw matches
// per pair and, critically, multiple independently-plausible pairs whose
// implied phase offsets actually clustered - real corroborating evidence
// clusterPhaseSolutions (below) needs, not a lucky single match.
//
// The model runs on the FULL frame, not a masked cutout: it was trained on
// natural images, and feeding it an artificially-blacked-out background is
// out-of-distribution input, not a help. Restricting to on-object
// correspondences happens as a post-filter against the same silhouette mask
// ORB used directly, discarding rather than never detecting matches on the
// background/turntable.
private fun attemptCrossRingPair(
    context: Context,
    projectId: String,
    ringA: ForgeScanRing,
    indexA: Int,
    ringB: ForgeScanRing,
    indexB: Int,
): CrossRingMatch? {
    val bitmapA = openScaledFrameBitmap(context, ringA.frames[indexA].uri, FeatureImageMaxSide)
    val bitmapB = openScaledFrameBitmap(context, ringB.frames[indexB].uri, FeatureImageMaxSide)
    try {
        val maskA = loadFeatureMask(context, projectId, ringA, indexA, bitmapA.width, bitmapA.height) ?: return null
        val maskB = loadFeatureMask(context, projectId, ringB, indexB, bitmapB.width, bitmapB.height) ?: return null

        val rawMatches = LearnedMatcher.match(context, bitmapA, bitmapB)
        val onObject = rawMatches.filter { m -> maskContains(maskA, m.ax, m.ay) && maskContains(maskB, m.bx, m.by) }
        if (onObject.size < MinInlierMatches) return null

        val ptsA = onObject.map { Point(it.ax.toDouble(), it.ay.toDouble()) }
        val ptsB = onObject.map { Point(it.bx.toDouble(), it.by.toDouble()) }

        val disparities = ptsA.indices.map { i -> disparityPx(ptsA[i], ptsB[i]) }
        val keptIndices = ptsA.indices.filter { i -> disparities[i] >= MinMatchDisparityPx }
        val filteredPtsA = keptIndices.map { ptsA[it] }
        val filteredPtsB = keptIndices.map { ptsB[it] }
        if (filteredPtsA.size < MinInlierMatches) return null

        val focal = estimateFocalLengthPixels(bitmapA.width, bitmapA.height)
        val principalPoint = Point(bitmapA.width / 2.0, bitmapA.height / 2.0)
        val cameraMatrix = Mat.eye(3, 3, CvType.CV_64F)
        cameraMatrix.put(0, 0, focal)
        cameraMatrix.put(1, 1, focal)
        cameraMatrix.put(0, 2, principalPoint.x)
        cameraMatrix.put(1, 2, principalPoint.y)

        val points1 = MatOfPoint2f(*filteredPtsA.toTypedArray())
        val points2 = MatOfPoint2f(*filteredPtsB.toTypedArray())
        Core.setRNGSeed(OpenCvRansacSeed)
        val essential = Calib3d.findEssentialMat(points1, points2, cameraMatrix, Calib3d.RANSAC, 0.999, 1.0)
        if (essential.empty() || essential.rows() != 3) return null

        val r = Mat()
        val t = Mat()
        val mask = Mat()
        val inliers = Calib3d.recoverPose(essential, points1, points2, cameraMatrix, r, t, mask)
        if (inliers < MinInlierMatches) return null

        val axisAngle = rotationAxisAngle(r) ?: return null
        return CrossRingMatch(axisAngle.angleRadians, inliers)
    } finally {
        bitmapA.recycle()
        bitmapB.recycle()
    }
}

private fun maskContains(mask: Mat, x: Float, y: Float): Boolean {
    val xi = x.toInt()
    val yi = y.toInt()
    if (xi < 0 || yi < 0 || xi >= mask.width() || yi >= mask.height()) return false
    return mask.get(yi, xi)[0] > 0.0
}

// Union-find over every populated, masked ring in the project: an edge
// exists wherever registerRingsRobust succeeds (feature-based registration
// first, silhouette phase search fallback - RingPhaseSearch.kt), and the
// final groups are the connected components - so a chain of
// pairwise-successful alignments
// transitively fuses into one group even if the two end rings never overlap
// directly (e.g. an "upright" ring might register against a "tilted" ring
// that itself registers against an "underside" ring, fusing all three, even
// if "upright" and "underside" alone wouldn't match). A ring with no
// successful edge to anything is its own singleton group - which is exactly
// what every project has produced until this feature existed, so a project
// with only one usable ring (or rings that genuinely don't overlap) behaves
// identically to before.
internal fun detectRingGroups(context: Context, project: ForgeScanProject): List<List<String>> {
    val populated = project.rings.filter { it.frames.isNotEmpty() }
    if (populated.size < 2) return populated.map { listOf(it.ringId) }

    val elevations = populated.associate { ring ->
        ring.ringId to (estimateRingElevationDegrees(context, project.projectId, ring) ?: ringElevationFallbackDegrees(ring.ringId)).toDouble()
    }

    val parent = HashMap<String, String>()
    fun find(x: String): String {
        var root = x
        while (parent[root] != root) root = parent.getValue(root)
        var cur = x
        while (parent[cur] != root) {
            val next = parent.getValue(cur)
            parent[cur] = root
            cur = next
        }
        return root
    }
    fun union(a: String, b: String) {
        val ra = find(a)
        val rb = find(b)
        if (ra != rb) parent[ra] = rb
    }
    for (ring in populated) parent[ring.ringId] = ring.ringId

    for (i in populated.indices) {
        for (j in i + 1 until populated.size) {
            val ringA = populated[i]
            val ringB = populated[j]
            val registration = registerRingsRobust(
                context,
                project,
                ringA,
                elevations.getValue(ringA.ringId),
                ringB,
                elevations.getValue(ringB.ringId),
            )
            Log.d(
                "ForgeScan",
                "Ring group detection: (${ringA.ringId},${ringB.ringId}) -> ${if (registration != null) "FUSED" else "separate"}",
            )
            if (registration != null) union(ringA.ringId, ringB.ringId)
        }
    }

    val groups = LinkedHashMap<String, MutableList<String>>()
    for (ring in populated) {
        val root = find(ring.ringId)
        groups.getOrPut(root) { ArrayList() } += ring.ringId
    }
    val result = groups.values.map { it.toList() }
    Log.i("ForgeScan", "Ring group detection: ${result.size} group(s) from ${populated.size} populated ring(s): $result")
    return result
}
