package com.forgescan.mobile

import android.content.Context
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
import org.opencv.features2d.DescriptorMatcher
import org.opencv.features2d.ORB
import org.opencv.imgproc.Imgproc
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.sqrt

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
private const val FeatureImageMaxSide = 640
private const val MinInlierMatches = 12

// Typical rear-camera horizontal field of view for a modern phone main lens.
// An error here skews the recovered translation/scale, not the rotation axis
// or the scale-independent cap ratio this file reads, so a moderate mismatch
// with the real device is tolerated.
private const val AssumedHorizontalFovDegrees = 65.0

internal class CapRadiusFractions(val top: Float?, val bottom: Float?)

private class PairMeasurement(
    val axis: Triple<Double, Double, Double>,
    val points: List<Triple<Double, Double, Double>>,
)

// Returns the measured elevation magnitude in [0, 90] degrees for this ring's
// own footage, or null if there wasn't enough usable feature correspondence
// to measure it (too few frames, too little texture, OpenCV unavailable) -
// callers fall back to the old hardcoded per-ring constant in that case.
internal fun estimateRingElevationDegrees(context: Context, ring: ForgeScanRing): Float? {
    val measurements = measureRingPairs(context, ring)
    if (measurements.isEmpty()) return null
    val estimates = measurements.map { asin(it.axis.third.coerceIn(-1.0, 1.0)) }.sorted()
    val median = estimates[estimates.size / 2]
    return Math.toDegrees(abs(median)).toFloat()
}

// Returns the measured top/bottom cap radius as a fraction of the object's
// mid-body radius, or null components where there wasn't enough data.
internal fun estimateRingCapRadiusFractions(context: Context, ring: ForgeScanRing): CapRadiusFractions? {
    val measurements = measureRingPairs(context, ring)
    if (measurements.isEmpty()) return null

    val topRatios = ArrayList<Double>()
    val bottomRatios = ArrayList<Double>()
    for (measurement in measurements) {
        val (top, bottom) = capRatiosFromPoints(measurement) ?: continue
        top?.let { topRatios += it }
        bottom?.let { bottomRatios += it }
    }
    val top = medianOrNull(topRatios)
    val bottom = medianOrNull(bottomRatios)
    if (top == null && bottom == null) return null
    return CapRadiusFractions(top?.toFloat(), bottom?.toFloat())
}

// Aggregates the per-ring cap measurement across every populated ring in the
// project into one pair of fractions for the whole reconstruction.
internal fun estimateCapRadiusFractions(context: Context, rings: List<ForgeScanRing>): CapRadiusFractions? {
    val tops = ArrayList<Double>()
    val bottoms = ArrayList<Double>()
    for (ring in rings) {
        val fractions = estimateRingCapRadiusFractions(context, ring) ?: continue
        fractions.top?.let { tops += it.toDouble() }
        fractions.bottom?.let { bottoms += it.toDouble() }
    }
    val top = medianOrNull(tops)
    val bottom = medianOrNull(bottoms)
    if (top == null && bottom == null) return null
    return CapRadiusFractions(top?.toFloat(), bottom?.toFloat())
}

private fun measureRingPairs(context: Context, ring: ForgeScanRing): List<PairMeasurement> {
    if (!OpenCvInit.ready) return emptyList()
    val frameCount = ring.frames.size
    if (frameCount < 2) return emptyList()

    val pairCount = minOf(MaxPairsPerRing, frameCount - 1)
    val stride = maxOf(1, frameCount / pairCount)

    val measurements = ArrayList<PairMeasurement>()
    var index = 0
    while (index + stride < frameCount && measurements.size < pairCount) {
        runCatching { measurePair(context, ring, index, index + stride) }.getOrNull()?.let { measurements += it }
        index += stride
    }
    return measurements
}

// For each triangulated point, height is its position along the ring's own
// rotation axis (relative to the pair's own centroid) and radius is its
// distance from that axis line - both in the pair's own unknown but
// internally-consistent scale. The ratio of cap-band radius to mid-band
// radius cancels that unknown scale out, so it's comparable across pairs
// (and rings) even though none of their absolute scales agree with each
// other.
private fun capRatiosFromPoints(measurement: PairMeasurement): Pair<Double?, Double?>? {
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
    return top to bottom
}

private fun medianOf(values: List<Double>): Double {
    val sorted = values.sorted()
    return sorted[sorted.size / 2]
}

private fun medianOrNull(values: List<Double>): Double? {
    if (values.isEmpty()) return null
    return medianOf(values)
}

private fun measurePair(context: Context, ring: ForgeScanRing, indexA: Int, indexB: Int): PairMeasurement? {
    val bitmapA = openScaledFrameBitmap(context, ring.frames[indexA].uri, FeatureImageMaxSide)
    val bitmapB = openScaledFrameBitmap(context, ring.frames[indexB].uri, FeatureImageMaxSide)
    try {
        val matA = Mat()
        val matB = Mat()
        Utils.bitmapToMat(bitmapA, matA)
        Utils.bitmapToMat(bitmapB, matB)
        Imgproc.cvtColor(matA, matA, Imgproc.COLOR_RGBA2GRAY)
        Imgproc.cvtColor(matB, matB, Imgproc.COLOR_RGBA2GRAY)

        val orb = ORB.create(800)
        val keypointsA = MatOfKeyPoint()
        val keypointsB = MatOfKeyPoint()
        val descriptorsA = Mat()
        val descriptorsB = Mat()
        orb.detectAndCompute(matA, Mat(), keypointsA, descriptorsA)
        orb.detectAndCompute(matB, Mat(), keypointsB, descriptorsB)
        if (descriptorsA.empty() || descriptorsB.empty()) return null

        val matcher = DescriptorMatcher.create(DescriptorMatcher.BRUTEFORCE_HAMMING)
        val knn = ArrayList<MatOfDMatch>()
        matcher.knnMatch(descriptorsA, descriptorsB, knn, 2)

        val listA = keypointsA.toList()
        val listB = keypointsB.toList()
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
        if (ptsA.size < MinInlierMatches) return null

        val focal = matA.width() / (2.0 * Math.tan(Math.toRadians(AssumedHorizontalFovDegrees / 2.0)))
        val principalPoint = Point(matA.width() / 2.0, matA.height() / 2.0)
        val cameraMatrix = Mat.eye(3, 3, CvType.CV_64F)
        cameraMatrix.put(0, 0, focal)
        cameraMatrix.put(1, 1, focal)
        cameraMatrix.put(0, 2, principalPoint.x)
        cameraMatrix.put(1, 2, principalPoint.y)

        val points1 = MatOfPoint2f(*ptsA.toTypedArray())
        val points2 = MatOfPoint2f(*ptsB.toTypedArray())
        val essential = Calib3d.findEssentialMat(points1, points2, cameraMatrix, Calib3d.RANSAC, 0.999, 1.0)
        if (essential.empty() || essential.rows() != 3) return null

        val r = Mat()
        val t = Mat()
        val mask = Mat()
        val inliers = Calib3d.recoverPose(essential, points1, points2, cameraMatrix, r, t, mask)
        if (inliers < MinInlierMatches) return null

        val axis = rotationAxis(r) ?: return null

        val maskBytes = ByteArray(mask.rows())
        mask.get(0, 0, maskBytes)
        val inlierA = ArrayList<Point>()
        val inlierB = ArrayList<Point>()
        for (i in ptsA.indices) {
            if (i < maskBytes.size && maskBytes[i].toInt() != 0) {
                inlierA += ptsA[i]
                inlierB += ptsB[i]
            }
        }
        if (inlierA.size < MinInlierMatches) return null

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
        if (points.size < MinInlierMatches) return null

        return PairMeasurement(axis, points)
    } finally {
        bitmapA.recycle()
        bitmapB.recycle()
    }
}

// Rodrigues' axis extraction: for a rotation matrix R with angle theta, the
// axis is the skew-symmetric part of R scaled by 1/(2 sin(theta)).
private fun rotationAxis(r: Mat): Triple<Double, Double, Double>? {
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
    return Triple(axisX / len, axisY / len, axisZ / len)
}
