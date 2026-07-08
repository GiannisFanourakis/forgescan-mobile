package com.forgescan.mobile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import java.io.File
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.calib3d.Calib3d
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfDMatch
import org.opencv.core.MatOfKeyPoint
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.core.Size
import org.opencv.features2d.DescriptorMatcher
import org.opencv.features2d.ORB
import org.opencv.imgproc.Imgproc
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.sqrt
import kotlin.math.tan

// Measures each ring's true camera elevation, and the object's real top/
// bottom cap width, from the footage itself instead of assuming a fixed
// angle and letting silhouette carving guess the cap shape. The capture is a
// turntable: the camera is stationary and the object spins on a single fixed
// axis, so the relative pose recovered by classic two-view epipolar geometry
// between any two frames in a ring is really the turntable's own rotation,
// expressed in that camera's coordinate frame - and triangulating the same
// matched features gives real 3D points on the object's surface, in that
// same frame.
//
// From one measured pair we get two things carving alone can't:
// - elevation: the rotation axis's alignment with the camera's own forward
//   direction (its Z in its own frame, i.e. simply the axis's Z component).
//   0 when the camera looks level at the object (spin axis flat in the image
//   plane), 90 when the camera looks straight down the spin axis.
// - cap shape: a single-elevation ring's silhouette cones graze the top/
//   bottom at the same shallow angle from every frame, so carving alone
//   can't tell a flat lid from a tapered dome there. The triangulated points'
//   own radius (distance from the spin axis) near the extremes of their own
//   measured height range says how wide the real cap actually is, relative
//   to the body - a ratio that's independent of the pair's unknown absolute
//   scale, so it doesn't need to agree with any other pair's scale to be
//   useful.
private object OpenCvInit {
    // OpenCVLoader.initLocal() loads a native library; on a device/ABI where
    // that fails, it can throw rather than just returning false. This code
    // needs to degrade to "no measurement" either way (see the fallback
    // paths in TurntableGeometry.kt), not crash the whole reconstruction.
    val ready: Boolean by lazy { runCatching { OpenCVLoader.initLocal() }.getOrDefault(false) }
}

private const val MaxPairsPerRing = 16
// Internal (not private): RingRegistration.kt reuses these constants and the
// mask/disparity helpers below for cross-ring matching, so a ring pair is
// held to the exact same matching standard as within-ring pairs are.
internal const val FeatureImageMaxSide = 640
internal const val MinInlierMatches = 12
// findEssentialMat/recoverPose are RANSAC-based and read from OpenCV's
// global RNG (Core.setRNGSeed), which is otherwise seeded from wall-clock
// time - reprocessing the exact same frames/matches could recover a
// different rotation on a different run for no reason a log could explain.
// Seeding it before every essential-matrix estimation (this file and
// RingRegistration.kt) makes a measurement reproducible: same input, same
// output, every time - a precondition for trusting any single run's result
// at all, separate from whether that result is itself correct.
internal const val OpenCvRansacSeed = 42

// Typical rear-camera horizontal field of view for a modern phone main lens,
// i.e. the lens's native WIDE axis - a phone's camera module is physically
// landscape, regardless of how the phone is held. Internal (not private):
// GaussianSplatExporter.kt reuses the same assumption for its own
// intrinsics/radius estimate, rather than risk a second, silently-
// inconsistent FOV guess. Only ever consumed through
// estimateFocalLengthPixels below - see that function for why applying this
// to whichever dimension happens to be labeled "width" was a real bug, not a
// tolerable approximation: an anisotropic FOV error (wrong on one axis,
// correct-ish on the other) can bias a recovered rotation axis, not just
// wash out into overall scale the way a uniform/isotropic error would.
internal const val AssumedHorizontalFovDegrees = 65.0

// A lens+sensor pair has exactly one physical focal length; treating it as
// axis-specific ("the width axis's focal length") is the bug this fixes.
// This app's captures are portrait (a turntable object shot is virtually
// always held vertically) - confirmed empirically (exported alpha frames are
// 788x1400, width < height) - so the sensor's actual wide axis (what
// AssumedHorizontalFovDegrees describes) ends up mapped onto image HEIGHT,
// not width. Using whichever dimension is actually larger keeps one shared
// focal length correct regardless of portrait vs. landscape, instead of
// assuming "width" always means "the wide axis" - which silently overestimated
// the narrow axis's angular extent by roughly 50% when that assumption held
// backwards, identically in every frame.
internal fun estimateFocalLengthPixels(width: Int, height: Int): Double {
    val wideAxisPixels = maxOf(width, height)
    return wideAxisPixels / (2.0 * tan(Math.toRadians(AssumedHorizontalFovDegrees / 2.0)))
}

// heightToBodyRadius is the object's own true total height (top of cap to
// bottom of base) divided by its mid-body radius - both taken from the same
// triangulated points in the same pair-local scale, so the unknown absolute
// scale cancels out just like the cap ratios do. ORB features rarely land on
// the turntable plate itself (it's untextured), so these triangulated points
// are effectively object-only - this ratio reflects the real object's shape,
// with no dependency on where carving decided the object ends and the
// turntable begins.
internal class CapRadiusFractions(val top: Float?, val bottom: Float?, val heightToBodyRadius: Float?)

// Internal (not private): GaussianSplatExporter.kt reuses this same
// stride-pair chain (via measureRingPairs) to build a measured per-frame
// azimuth track, rather than duplicating the ORB/essential-matrix/
// triangulation pipeline a second time. startIndex/endIndex are the ring
// frame indices this pair actually spans - the exporter needs them to know
// which frame each measured angle applies to; nothing in TurntableSfm.kt's
// own cap/elevation measurements uses them.
internal class PairMeasurement(
    val startIndex: Int,
    val endIndex: Int,
    val axis: Triple<Double, Double, Double>,
    val angleRadians: Double,
    val points: List<Triple<Double, Double, Double>>,
)

// Returns the measured elevation magnitude in [0, 90] degrees for this ring's
// own footage, or null if there wasn't enough usable feature correspondence
// to measure it (too few frames, too little texture, OpenCV unavailable) -
// callers fall back to the old hardcoded per-ring constant in that case.
private const val MaxAxisDeviationDegrees = 30.0
private const val MinConsistentPairsForElevation = 3

internal fun estimateRingElevationDegrees(context: Context, projectId: String, ring: ForgeScanRing): Float? {
    val measurements = measureRingPairs(context, projectId, ring)
    if (measurements.isEmpty()) {
        Log.i("ForgeScan", "SfM elevation: ring '${ring.ringId}' -> fallback (0 usable pair measurements)")
        return null
    }

    // A pair passing its own per-pair checks (inlier count, plausible
    // rotation magnitude) doesn't guarantee its recovered axis actually
    // agrees with the ring's real, single, physical rotation axis - a
    // confidently-wrong outlier averaged in with a plain median can pull the
    // result away from the true elevation (this is the mechanism that
    // produced 3.39deg against a ~60deg expectation on the tilted-ring
    // capture that motivated this check). Requiring agreement with the
    // group's own median axis - not just "passed its own thresholds" -
    // catches a pair that's individually plausible but collectively an
    // outlier.
    val axes = measurements.map { it.axis }
    val medianAxis = medianAxis(axes)
    val consistent = measurements.filter { angleBetweenDegrees(it.axis, medianAxis) <= MaxAxisDeviationDegrees }

    if (consistent.size < MinConsistentPairsForElevation) {
        Log.i(
            "ForgeScan",
            "SfM elevation: ring '${ring.ringId}' -> fallback (only ${consistent.size}/${measurements.size} pairs agreed on a " +
                "common rotation axis within ${MaxAxisDeviationDegrees}deg, need $MinConsistentPairsForElevation)",
        )
        return null
    }

    val estimates = consistent.map { asin(it.axis.third.coerceIn(-1.0, 1.0)) }.sorted()
    val median = estimates[estimates.size / 2]
    val elevation = Math.toDegrees(abs(median)).toFloat()
    Log.i("ForgeScan", "SfM elevation: ring '${ring.ringId}' -> measured $elevation deg from ${consistent.size}/${measurements.size} axis-consistent pair(s)")
    return elevation
}

private fun medianAxis(axes: List<Triple<Double, Double, Double>>): Triple<Double, Double, Double> {
    val xs = axes.map { it.first }.sorted()
    val ys = axes.map { it.second }.sorted()
    val zs = axes.map { it.third }.sorted()
    val mid = axes.size / 2
    val x = xs[mid]
    val y = ys[mid]
    val z = zs[mid]
    val len = sqrt(x * x + y * y + z * z)
    return if (len < 1e-9) Triple(x, y, z) else Triple(x / len, y / len, z / len)
}

private fun angleBetweenDegrees(a: Triple<Double, Double, Double>, b: Triple<Double, Double, Double>): Double {
    val dot = (a.first * b.first + a.second * b.second + a.third * b.third).coerceIn(-1.0, 1.0)
    return Math.toDegrees(acos(dot))
}

// Returns the measured top/bottom cap radius as a fraction of the object's
// mid-body radius, or null components where there wasn't enough data.
internal fun estimateRingCapRadiusFractions(context: Context, projectId: String, ring: ForgeScanRing): CapRadiusFractions? {
    val measurements = measureRingPairs(context, projectId, ring)
    if (measurements.isEmpty()) return null

    val topRatios = ArrayList<Double>()
    val bottomRatios = ArrayList<Double>()
    val heightRatios = ArrayList<Double>()
    for (measurement in measurements) {
        val shape = capRatiosFromPoints(measurement) ?: continue
        shape.top?.let { topRatios += it.toDouble() }
        shape.bottom?.let { bottomRatios += it.toDouble() }
        shape.heightToBodyRadius?.let { heightRatios += it.toDouble() }
    }
    val top = medianOrNull(topRatios)
    val bottom = medianOrNull(bottomRatios)
    val heightToBodyRadius = medianOrNull(heightRatios)
    if (top == null && bottom == null && heightToBodyRadius == null) return null
    return CapRadiusFractions(top?.toFloat(), bottom?.toFloat(), heightToBodyRadius?.toFloat())
}

// Aggregates the per-ring cap measurement across every populated ring in the
// project into one pair of fractions for the whole reconstruction.
internal fun estimateCapRadiusFractions(context: Context, projectId: String, rings: List<ForgeScanRing>): CapRadiusFractions? {
    val tops = ArrayList<Double>()
    val bottoms = ArrayList<Double>()
    val heights = ArrayList<Double>()
    for (ring in rings) {
        val fractions = estimateRingCapRadiusFractions(context, projectId, ring) ?: continue
        fractions.top?.let { tops += it.toDouble() }
        fractions.bottom?.let { bottoms += it.toDouble() }
        fractions.heightToBodyRadius?.let { heights += it.toDouble() }
    }
    val top = medianOrNull(tops)
    val bottom = medianOrNull(bottoms)
    val heightToBodyRadius = medianOrNull(heights)
    if (top == null && bottom == null && heightToBodyRadius == null) return null
    return CapRadiusFractions(top?.toFloat(), bottom?.toFloat(), heightToBodyRadius?.toFloat())
}

internal fun measureRingPairs(context: Context, projectId: String, ring: ForgeScanRing): List<PairMeasurement> {
    if (!OpenCvInit.ready) {
        Log.d("ForgeScan", "SfM: OpenCvInit.ready=false - ALL SfM measurement is disabled for ring '${ring.ringId}' " +
            "(elevation, cap fractions, heightToBodyRadius). stripTurntableBase loses its measured ground truth and " +
            "falls back to the radius-profile guess; elevation/cap shape fall back to hardcoded per-ring constants.")
        return emptyList()
    }
    val frameCount = ring.frames.size
    if (frameCount < 2) return emptyList()

    val pairCount = minOf(MaxPairsPerRing, frameCount - 1)
    val stride = maxOf(1, frameCount / pairCount)

    logSilhouetteCoverage(context, projectId, ring, frameCount, stride)

    val measurements = ArrayList<PairMeasurement>()
    var index = 0
    while (index + stride < frameCount && measurements.size < pairCount) {
        runCatching { measurePair(context, projectId, ring, index, index + stride) }.getOrNull()?.let { measurements += it }
        index += stride
    }
    Log.d("ForgeScan", "SfM: ring '${ring.ringId}' produced ${measurements.size}/${(frameCount - 1) / stride + 1} usable pair measurement(s)")
    return measurements
}

// Independent of feature matching - just reports how much of each sampled
// frame the existing mask already thinks is foreground, so a bad/empty mask
// on this ring (rather than a feature-matching problem) is visible without
// having to cross-reference two different failure modes by hand.
private fun logSilhouetteCoverage(context: Context, projectId: String, ring: ForgeScanRing, frameCount: Int, stride: Int) {
    val maskDir = ringMaskDir(context, projectId, ring.ringId)
    var index = 0
    while (index < frameCount) {
        val file = File(maskDir, "frame-${index.toFrameNumber()}-silhouette.png")
        if (file.exists()) {
            val bitmap = BitmapFactory.decodeFile(file.absolutePath)
            if (bitmap != null) {
                val w = bitmap.width
                val h = bitmap.height
                val pixels = IntArray(w * h)
                bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
                bitmap.recycle()
                val foreground = pixels.count { (it and 0xFF) > 127 }
                val fraction = foreground.toDouble() / pixels.size
                Log.d("ForgeScan", "SfM diag: ring '${ring.ringId}' frame ${index.toFrameNumber()} silhouette foreground fraction = ${"%.3f".format(fraction)}")
            }
        }
        index += stride
    }
}

// For each triangulated point, height is its position along the ring's own
// rotation axis (relative to the pair's own centroid) and radius is its
// distance from that axis line - both in the pair's own unknown but
// internally-consistent scale. The ratio of cap-band radius to mid-band
// radius cancels that unknown scale out, so it's comparable across pairs
// (and rings) even though none of their absolute scales agree with each
// other.
private fun capRatiosFromPoints(measurement: PairMeasurement): CapRadiusFractions? {
    val points = measurement.points
    if (points.size < MinInlierMatches) return null
    val (ax, ay, az) = measurement.axis

    val cx = points.sumOf { it.first } / points.size
    val cy = points.sumOf { it.second } / points.size
    val cz = points.sumOf { it.third } / points.size

    val heights = DoubleArray(points.size)
    val radii = DoubleArray(points.size)
    for (i in points.indices) {
        val rx = points[i].first - cx
        val ry = points[i].second - cy
        val rz = points[i].third - cz
        val height = rx * ax + ry * ay + rz * az
        val px = rx - height * ax
        val py = ry - height * ay
        val pz = rz - height * az
        heights[i] = height
        radii[i] = sqrt(px * px + py * py + pz * pz)
    }

    val minH = heights.min()
    val maxH = heights.max()
    val span = maxH - minH
    if (span < 1e-9) return null

    val topBand = ArrayList<Double>()
    val bottomBand = ArrayList<Double>()
    val midBand = ArrayList<Double>()
    for (i in points.indices) {
        val t = (heights[i] - minH) / span
        when {
            t > 0.85 -> topBand += radii[i]
            t < 0.15 -> bottomBand += radii[i]
            t in 0.4..0.6 -> midBand += radii[i]
        }
    }
    if (midBand.size < 3) return null
    val bodyRadius = medianOf(midBand)
    if (bodyRadius < 1e-9) return null

    val top = if (topBand.size >= 3) medianOf(topBand) / bodyRadius else null
    val bottom = if (bottomBand.size >= 3) medianOf(bottomBand) / bodyRadius else null
    val heightToBodyRadius = span / bodyRadius
    return CapRadiusFractions(top?.toFloat(), bottom?.toFloat(), heightToBodyRadius.toFloat())
}

private fun medianOf(values: List<Double>): Double {
    val sorted = values.sorted()
    return sorted[sorted.size / 2]
}

private fun medianOrNull(values: List<Double>): Double? {
    if (values.isEmpty()) return null
    return medianOf(values)
}

// Tries ORB feature matching restricted to the object's own silhouette
// first, then falls back to unrestricted full-frame matching if that fails
// or comes up short of MinInlierMatches. See attemptMeasurePair for why the
// mask matters; this just orchestrates the two attempts and logs which one
// actually produced a usable measurement.
private fun measurePair(context: Context, projectId: String, ring: ForgeScanRing, indexA: Int, indexB: Int): PairMeasurement? {
    val masked = attemptMeasurePair(context, projectId, ring, indexA, indexB, useMask = true)
    if (masked != null) {
        Log.d("ForgeScan", "SfM pair ($indexA,$indexB): masked attempt succeeded, no fallback needed")
        return masked
    }
    val fullFrame = attemptMeasurePair(context, projectId, ring, indexA, indexB, useMask = false)
    Log.d(
        "ForgeScan",
        "SfM pair ($indexA,$indexB): masked attempt failed, full-frame fallback ${if (fullFrame != null) "succeeded" else "also failed"}",
    )
    return fullFrame
}

// A fixed camera means every static-background pixel - anything behind or
// around the turntable - matches itself between frame A and frame B with
// zero disparity. Those zero-disparity correspondences are geometrically
// degenerate for the essential matrix (a real camera baseline can't produce
// zero parallax on a static point unless it's at infinity), and at steep
// elevations the object itself is foreshortened into a smaller fraction of
// the frame - so background matches don't just add noise, they can
// outnumber and dominate the real object correspondences RANSAC has to
// choose from, starving recoverPose of real inliers even when plenty of
// keypoints were found. This is also a plausible source of the per-segment
// under-rotation bias documented in TurntableGeometry.kt's reverted
// cumulative-angle experiment: a fit partly pulled toward "zero rotation"
// by contaminating static-background matches would look exactly like a
// systematic per-segment bias that compounds across the chain.
//
// Restricting ORB detection to the object's own silhouette (already
// computed by BackgroundRemoval.kt for every frame) removes the static
// background from contention entirely, rather than hoping RANSAC's outlier
// rejection sorts it out after the fact - which this ring's own diagnostic
// logs showed it wasn't managing to do.
private fun attemptMeasurePair(
    context: Context,
    projectId: String,
    ring: ForgeScanRing,
    indexA: Int,
    indexB: Int,
    useMask: Boolean,
): PairMeasurement? {
    val tag = if (useMask) "masked" else "full-frame"
    val bitmapA = openScaledFrameBitmap(context, ring.frames[indexA].uri, FeatureImageMaxSide)
    val bitmapB = openScaledFrameBitmap(context, ring.frames[indexB].uri, FeatureImageMaxSide)
    try {
        val matA = Mat()
        val matB = Mat()
        Utils.bitmapToMat(bitmapA, matA)
        Utils.bitmapToMat(bitmapB, matB)
        Imgproc.cvtColor(matA, matA, Imgproc.COLOR_RGBA2GRAY)
        Imgproc.cvtColor(matB, matB, Imgproc.COLOR_RGBA2GRAY)

        val maskA = if (useMask) loadFeatureMask(context, projectId, ring, indexA, matA.width(), matA.height()) else null
        val maskB = if (useMask) loadFeatureMask(context, projectId, ring, indexB, matB.width(), matB.height()) else null
        if (useMask && (maskA == null || maskB == null)) {
            Log.d("ForgeScan", "SfM pair ($indexA,$indexB) $tag: silhouette mask unavailable, aborting this attempt")
            return null
        }

        val orb = ORB.create(800)
        val keypointsA = MatOfKeyPoint()
        val keypointsB = MatOfKeyPoint()
        val descriptorsA = Mat()
        val descriptorsB = Mat()
        orb.detectAndCompute(matA, maskA ?: Mat(), keypointsA, descriptorsA)
        orb.detectAndCompute(matB, maskB ?: Mat(), keypointsB, descriptorsB)
        val listA = keypointsA.toList()
        val listB = keypointsB.toList()
        if (descriptorsA.empty() || descriptorsB.empty()) {
            Log.d("ForgeScan", "SfM pair ($indexA,$indexB) $tag: keypoints A=${listA.size} B=${listB.size} - no descriptors, stage=detect")
            return null
        }

        val matcher = DescriptorMatcher.create(DescriptorMatcher.BRUTEFORCE_HAMMING)
        val knn = ArrayList<MatOfDMatch>()
        matcher.knnMatch(descriptorsA, descriptorsB, knn, 2)

        val ptsA = ArrayList<Point>()
        val ptsB = ArrayList<Point>()
        for (m in knn) {
            val candidates = m.toArray()
            if (candidates.size < 2) continue
            val best = candidates[0]
            val second = candidates[1]
            if (best.distance < 0.75f * second.distance) {
                ptsA += listA[best.queryIdx].pt
                ptsB += listB[best.trainIdx].pt
            }
        }
        if (ptsA.size < MinInlierMatches) {
            Log.d(
                "ForgeScan",
                "SfM pair ($indexA,$indexB) $tag: keypoints A=${listA.size} B=${listB.size}, ratio-test survivors=${ptsA.size} - stage=ratio-test",
            )
            return null
        }

        // A fixed camera means a real object feature moves between frame A
        // and frame B (~20-40px here, for ~20deg/pair of real turntable
        // rotation), but anything image-stationary - the occluding contour
        // of the rotating object's own silhouette edge, or a fixed-light
        // specular highlight that doesn't travel with the surface under it -
        // matches itself at (near) zero disparity. That's not merely
        // uninformative noise: for x' = x, the epipolar constraint
        // x'^T E x = 0 is satisfied by R = identity with arbitrary t, so a
        // stationary-dominated correspondence set is a self-consistent WRONG
        // model - RANSAC will happily report a large inlier count for it,
        // because "no rotation" genuinely fits those points well. This is
        // why some pairs recovered plenty of inliers but a near-identity
        // rotation: not the essential matrix's four-solution disambiguation
        // failing (the twisted-pair alternative to a real ~20deg rotation is
        // ~180deg, not identity), but the fitted model itself being wrong in
        // a way that looks confident. Dropping low-disparity matches before
        // findEssentialMat is the foreground counterpart of the silhouette
        // background-masking fix above.
        val disparities = ptsA.indices.map { i -> disparityPx(ptsA[i], ptsB[i]) }
        Log.d("ForgeScan", "SfM pair ($indexA,$indexB) $tag: ratio-test disparity histogram ${disparityHistogram(disparities)}")
        val keptIndices = ptsA.indices.filter { i -> disparities[i] >= MinMatchDisparityPx }
        Log.d(
            "ForgeScan",
            "SfM pair ($indexA,$indexB) $tag: disparity filter (>=${MinMatchDisparityPx}px) kept=${keptIndices.size} dropped=${ptsA.size - keptIndices.size}",
        )
        val filteredPtsA = keptIndices.map { ptsA[it] }
        val filteredPtsB = keptIndices.map { ptsB[it] }
        if (filteredPtsA.size < MinInlierMatches) {
            Log.d(
                "ForgeScan",
                "SfM pair ($indexA,$indexB) $tag: ratio-test survivors=${ptsA.size}, disparity-filtered survivors=${filteredPtsA.size} - stage=disparity-filter",
            )
            return null
        }

        // matA/matB are Utils.bitmapToMat(openScaledFrameBitmap(...)) with no
        // rotation/transpose anywhere in between - same portrait pixel
        // orientation as the stored frame files, so this is a direct
        // drop-in for the width-only formula, not just a same-shaped call.
        val focal = estimateFocalLengthPixels(matA.width(), matA.height())
        val principalPoint = Point(matA.width() / 2.0, matA.height() / 2.0)
        val cameraMatrix = Mat.eye(3, 3, CvType.CV_64F)
        cameraMatrix.put(0, 0, focal)
        cameraMatrix.put(1, 1, focal)
        cameraMatrix.put(0, 2, principalPoint.x)
        cameraMatrix.put(1, 2, principalPoint.y)

        val points1 = MatOfPoint2f(*filteredPtsA.toTypedArray())
        val points2 = MatOfPoint2f(*filteredPtsB.toTypedArray())
        Core.setRNGSeed(OpenCvRansacSeed)
        val essential = Calib3d.findEssentialMat(points1, points2, cameraMatrix, Calib3d.RANSAC, 0.999, 1.0)
        if (essential.empty() || essential.rows() != 3) {
            Log.d(
                "ForgeScan",
                "SfM pair ($indexA,$indexB) $tag: disparity-filtered survivors=${filteredPtsA.size}, findEssentialMat empty=true - stage=essential-matrix",
            )
            return null
        }

        val r = Mat()
        val t = Mat()
        val mask = Mat()
        val inliers = Calib3d.recoverPose(essential, points1, points2, cameraMatrix, r, t, mask)
        if (inliers < MinInlierMatches) {
            Log.d(
                "ForgeScan",
                "SfM pair ($indexA,$indexB) $tag: disparity-filtered survivors=${filteredPtsA.size}, recoverPose inliers=$inliers - stage=recover-pose",
            )
            return null
        }

        val maskBytes = ByteArray(mask.rows())
        mask.get(0, 0, maskBytes)
        val inlierA = ArrayList<Point>()
        val inlierB = ArrayList<Point>()
        val inlierDisparities = ArrayList<Double>()
        for (i in filteredPtsA.indices) {
            if (i < maskBytes.size && maskBytes[i].toInt() != 0) {
                inlierA += filteredPtsA[i]
                inlierB += filteredPtsB[i]
                inlierDisparities += disparityPx(filteredPtsA[i], filteredPtsB[i])
            }
        }
        Log.d("ForgeScan", "SfM pair ($indexA,$indexB) $tag: recoverPose-inlier disparity histogram ${disparityHistogram(inlierDisparities)}")
        if (inlierA.size < MinInlierMatches) {
            Log.d("ForgeScan", "SfM pair ($indexA,$indexB) $tag: recoverPose inliers=$inliers but re-derived inlier list=${inlierA.size} - stage=inlier-extraction")
            return null
        }

        val axisAngle = rotationAxisAngle(r)
        if (axisAngle == null) {
            Log.d("ForgeScan", "SfM pair ($indexA,$indexB) $tag: recoverPose inliers=$inliers but rotation too small to extract an axis - stage=axis-extraction")
            return null
        }

        // Loose on purpose. For azimuth (GaussianSplatExporter.kt),
        // agreement-with-uniform-spacing is literally the quantity under
        // test, so this floor must stay a coarse net that only rejects
        // grossly-implausible pairs (e.g. a still-contaminated near-identity
        // rotation that slipped past the disparity filter) - not a mechanism
        // that enforces the uniform assumption by construction. Tightening
        // it toward the stride-expected angle would make "the measurement
        // agrees with uniform spacing" true by definition instead of by
        // evidence, defeating the point of measuring it at all.
        val strideFrames = indexB - indexA
        val expectedAngleDegrees = 0.3 * strideFrames.toDouble() / ring.frames.size * 360.0
        val measuredAngleDegrees = Math.toDegrees(axisAngle.angleRadians)
        if (measuredAngleDegrees < expectedAngleDegrees) {
            Log.d(
                "ForgeScan",
                "SfM pair ($indexA,$indexB) $tag: recovered angle=$measuredAngleDegrees deg < plausibility floor=$expectedAngleDegrees deg - stage=angle-plausibility",
            )
            return null
        }

        val rt = Mat(3, 4, CvType.CV_64F)
        for (row in 0 until 3) for (col in 0 until 3) rt.put(row, col, r.get(row, col)[0])
        for (row in 0 until 3) rt.put(row, 3, t.get(row, 0)[0])
        val p1 = Mat(3, 4, CvType.CV_64F)
        for (row in 0 until 3) for (col in 0 until 3) p1.put(row, col, cameraMatrix.get(row, col)[0])
        for (row in 0 until 3) p1.put(row, 3, 0.0)
        val p2 = Mat()
        Core.gemm(cameraMatrix, rt, 1.0, Mat(), 0.0, p2)

        val inlierPoints1 = MatOfPoint2f(*inlierA.toTypedArray())
        val inlierPoints2 = MatOfPoint2f(*inlierB.toTypedArray())
        val points4D = Mat()
        Calib3d.triangulatePoints(p1, p2, inlierPoints1, inlierPoints2, points4D)

        val points = ArrayList<Triple<Double, Double, Double>>()
        for (col in 0 until points4D.cols()) {
            val w = points4D.get(3, col)[0]
            if (abs(w) < 1e-9) continue
            val x = points4D.get(0, col)[0] / w
            val y = points4D.get(1, col)[0] / w
            val z = points4D.get(2, col)[0] / w
            points += Triple(x, y, z)
        }
        if (points.size < MinInlierMatches) {
            Log.d(
                "ForgeScan",
                "SfM pair ($indexA,$indexB) $tag: recoverPose inliers=$inliers, triangulated points=${points.size} - stage=triangulation",
            )
            return null
        }

        Log.d(
            "ForgeScan",
            "SfM pair ($indexA,$indexB) $tag: keypoints A=${listA.size} B=${listB.size}, disparity-filtered survivors=${filteredPtsA.size}, " +
                "recoverPose inliers=$inliers, angle=$measuredAngleDegrees deg, triangulated points=${points.size} - SUCCESS",
        )
        return PairMeasurement(
            startIndex = indexA,
            endIndex = indexB,
            axis = axisAngle.axis,
            angleRadians = axisAngle.angleRadians,
            points = points,
        )
    } finally {
        bitmapA.recycle()
        bitmapB.recycle()
    }
}

internal const val MinMatchDisparityPx = 4f
private val DisparityBucketUpperBoundsPx = doubleArrayOf(2.0, 5.0, 10.0, 20.0, 40.0)
private val DisparityBucketLabels = listOf("0-2", "2-5", "5-10", "10-20", "20-40", "40+")

internal fun disparityPx(a: Point, b: Point): Double {
    val dx = a.x - b.x
    val dy = a.y - b.y
    return sqrt(dx * dx + dy * dy)
}

private fun disparityHistogram(disparities: List<Double>): String {
    val counts = IntArray(DisparityBucketUpperBoundsPx.size + 1)
    for (d in disparities) {
        var bucket = DisparityBucketUpperBoundsPx.size
        for (i in DisparityBucketUpperBoundsPx.indices) {
            if (d < DisparityBucketUpperBoundsPx[i]) {
                bucket = i
                break
            }
        }
        counts[bucket]++
    }
    return DisparityBucketLabels.zip(counts.toList()).joinToString { (label, count) -> "$label:$count" }
}

// Loads this frame's already-computed silhouette mask (BackgroundRemoval.kt
// writes one per frame alongside the alpha cutout), scaled to match the
// feature-detection image size and dilated by ~2px so real object-edge
// features right at the silhouette boundary aren't clipped by mask
// antialiasing/downscaling - the same reasoning as TurntableGeometry.kt's
// own mask dilation before carving. Returns null if the mask is missing or
// unreadable, so the caller aborts that attempt rather than silently
// detecting features over a blank or stale mask.
internal fun loadFeatureMask(context: Context, projectId: String, ring: ForgeScanRing, index: Int, targetWidth: Int, targetHeight: Int): Mat? {
    val maskDir = ringMaskDir(context, projectId, ring.ringId)
    val file = File(maskDir, "frame-${index.toFrameNumber()}-silhouette.png")
    if (!file.exists()) return null
    val bitmap = BitmapFactory.decodeFile(file.absolutePath) ?: return null
    val scaled = if (bitmap.width == targetWidth && bitmap.height == targetHeight) {
        bitmap
    } else {
        Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true).also { if (it !== bitmap) bitmap.recycle() }
    }
    val mat = Mat()
    Utils.bitmapToMat(scaled, mat)
    scaled.recycle()
    Imgproc.cvtColor(mat, mat, Imgproc.COLOR_RGBA2GRAY)
    Imgproc.threshold(mat, mat, 127.0, 255.0, Imgproc.THRESH_BINARY)
    val dilated = Mat()
    val kernel = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(5.0, 5.0))
    Imgproc.dilate(mat, dilated, kernel)
    return dilated
}

// Rodrigues' axis+angle extraction: for a rotation matrix R with angle theta,
// the axis is the skew-symmetric part of R scaled by 1/(2 sin(theta)), and
// theta itself falls out of the trace (trace = 1 + 2*cos(theta)) - already
// computed as an intermediate here, just never returned before now.
// GaussianSplatExporter.kt is the first caller that needs the angle (to
// build a measured per-frame rotation track); every existing caller here
// still only wants the axis, so that path (rotationAxis) is kept as a thin
// wrapper rather than changing its signature.
internal class AxisAngle(val axis: Triple<Double, Double, Double>, val angleRadians: Double)

internal fun rotationAxisAngle(r: Mat): AxisAngle? {
    val m = DoubleArray(9)
    r.get(0, 0, m)
    val trace = m[0] + m[4] + m[8]
    val cosTheta = ((trace - 1.0) / 2.0).coerceIn(-1.0, 1.0)
    val sinTheta = sqrt(1.0 - cosTheta * cosTheta)
    if (sinTheta < 1e-6) return null
    val axisX = (m[7] - m[5]) / (2.0 * sinTheta)
    val axisY = (m[2] - m[6]) / (2.0 * sinTheta)
    val axisZ = (m[3] - m[1]) / (2.0 * sinTheta)
    val len = sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ)
    if (len < 1e-9) return null
    val theta = Math.acos(cosTheta)
    return AxisAngle(Triple(axisX / len, axisY / len, axisZ / len), theta)
}
