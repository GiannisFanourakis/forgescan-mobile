package com.forgescan.mobile

import android.content.Context
import android.graphics.BitmapFactory
import android.util.Log
import java.io.File
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan
import kotlin.random.Random
import org.json.JSONArray
import org.json.JSONObject

// Exports one ring's masked frames as a self-contained dataset for a desktop
// 3D Gaussian Splatting trainer (Brush, nerfstudio, etc.) - transforms.json
// (camera poses + intrinsics), images/ (the alpha cutouts already produced by
// BackgroundRemoval.kt), and points.ply. points.ply is seeded from whichever
// source is richer: the carved+colorized visual-hull mesh
// (ReconstructionPipeline.kt), when the caller has one for these exact
// ring(s), or else the same triangulated features TurntableSfm.kt already
// computes for elevation/cap measurement (see meshSeedPoints vs.
// buildSeedPointCloud below). This is a read-only view of existing
// measurements: nothing here changes carving, meshing, or the existing
// GLB/OBJ export paths.
//
// Single ring only (v1) - no multi-ring stitching. GS training wants a real
// perspective camera track, not the orthographic per-frame basis carving
// uses (FrameProjection in TurntableGeometry.kt), so poses are synthesized
// fresh here (circular orbit at a measured elevation/radius) rather than
// reusing that projection directly - though it deliberately shares the same
// canonical axis convention (+Y = spin axis, object at origin) so this
// export and the carve agree on what "the object's own frame" means.
private const val MaxSeedPoints = 20_000
private const val RandomSeedPointCount = 2_000
private const val MinRadius = 1.5
private const val MaxRadius = 10.0
private const val DefaultRadius = 3.0

internal data class Vec3(val x: Double, val y: Double, val z: Double) {
    operator fun minus(o: Vec3) = Vec3(x - o.x, y - o.y, z - o.z)
    operator fun plus(o: Vec3) = Vec3(x + o.x, y + o.y, z + o.z)
    operator fun times(s: Double) = Vec3(x * s, y * s, z * s)
    fun dot(o: Vec3) = x * o.x + y * o.y + z * o.z
    fun cross(o: Vec3) = Vec3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x)
    fun length() = sqrt(dot(this))
    fun normalized(): Vec3 {
        val l = length()
        return if (l < 1e-12) this else Vec3(x / l, y / l, z / l)
    }
}

private data class SeedPoint(val position: Vec3, val r: Int, val g: Int, val b: Int)

// mesh, when given, must be the exact ForgeScanMesh runReconstructionPipeline
// carved from this same ring alone (ReconstructionResult.carvedRingIds ==
// [ring.ringId]) - see meshSeedPoints for why that mesh is a strictly better
// seed source than the sparse SfM cloud, and why a mismatched mesh can't be
// substituted here.
suspend fun exportGaussianSplatDataset(context: Context, project: ForgeScanProject, ring: ForgeScanRing, outputDir: File, mesh: ForgeScanMesh? = null) {
    val frameCount = ring.frames.size
    require(frameCount > 0) { "Ring '${ring.label}' has no frames." }
    val maskDir = ringMaskDir(context, project.projectId, ring.ringId)
    val alphaFiles = (0 until frameCount).map { i -> File(maskDir, "frame-${i.toFrameNumber()}-alpha.png") }
    require(alphaFiles.all { it.exists() }) {
        "Ring '${ring.label}' is not masked yet - run Process at least once before exporting a GS dataset."
    }

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(alphaFiles[0].absolutePath, bounds)
    val width = bounds.outWidth
    val height = bounds.outHeight
    require(width > 0 && height > 0) { "Could not read masked frame dimensions for '${ring.label}'." }
    val focal = estimateFocalLengthPixels(width, height)

    val elevationDegrees = (estimateRingElevationDegrees(context, project.projectId, ring) ?: ringElevationFallbackDegrees(ring.ringId)).toDouble()

    val measuredAzimuth = measuredAzimuthDegrees(context, project.projectId, ring)
    val perFrameAzimuthDegrees = measuredAzimuth ?: DoubleArray(frameCount) { i -> i.toDouble() / frameCount * 360.0 }
    Log.d("ForgeScan", "GS export: azimuth source = ${if (measuredAzimuth != null) "measured" else "uniform"}, elevation=$elevationDegrees deg")

    val ringSilhouettes = loadRingSilhouettes(context, project, ring)
    val radius = estimateOrbitRadius(ringSilhouettes)

    val transformsJson = buildTransformsJson(width, height, focal, elevationDegrees, perFrameAzimuthDegrees, radius, frameCount)
    val points = if (mesh != null) {
        Log.d("ForgeScan", "GS export points.ply: seeding from carved+colorized mesh instead of sparse SfM points")
        meshSeedPoints(mesh)
    } else {
        buildSeedPointCloud(context, project.projectId, ring, perFrameAzimuthDegrees)
    }

    outputDir.mkdirs()
    val imagesDir = File(outputDir, "images").apply { mkdirs() }
    for (i in 0 until frameCount) {
        alphaFiles[i].copyTo(File(imagesDir, "frame-${i.toFrameNumber()}.png"), overwrite = true)
    }
    File(outputDir, "transforms.json").writeText(transformsJson.toString(2))
    writePly(points, File(outputDir, "points.ply"))
}

internal fun ringElevationFallbackDegrees(ringId: String): Float =
    RingElevationDegrees[ringId] ?: DefaultElevationDegrees

// Fuses multiple registered rings (a detectRingGroups group, RingRegistration.kt)
// into one dataset: one shared images/ + transforms.json + points.ply, with
// every non-reference ring's azimuth/points rotated and shifted by its
// solved registration offset before being folded in. rings.size == 1 behaves
// exactly like exportGaussianSplatDataset (the plain per-ring path), so a
// project where nothing fuses is unaffected by this function existing.
//
// Known limitation: registration is only re-solved between the FIRST ring in
// the list (the reference) and each other ring directly, not composed along
// whatever path actually connected them in detectRingGroups' graph. For a
// group of exactly two rings (the only case exercised so far) this is
// exactly the edge that formed the group, so it's not a simplification in
// that case - it only matters for a future group of 3+ rings where not
// every pair directly overlaps.
suspend fun exportFusedGaussianSplatDataset(context: Context, project: ForgeScanProject, rings: List<ForgeScanRing>, outputDir: File, mesh: ForgeScanMesh? = null) {
    require(rings.isNotEmpty()) { "No rings to export." }
    if (rings.size == 1) {
        exportGaussianSplatDataset(context, project, rings[0], outputDir, mesh)
        return
    }

    val reference = rings[0]
    val referenceElevation = (estimateRingElevationDegrees(context, project.projectId, reference) ?: ringElevationFallbackDegrees(reference.ringId)).toDouble()

    class RingPlan(
        val ring: ForgeScanRing,
        val elevationDegrees: Double,
        val azimuthDegrees: DoubleArray,
        val radius: Double,
        val width: Int,
        val height: Int,
        val focal: Double,
        val phaseOffsetDegrees: Double,
        val verticalOffset: Double,
    )

    val plans = ArrayList<RingPlan>()
    for (ring in rings) {
        val frameCount = ring.frames.size
        if (frameCount == 0) {
            Log.d("ForgeScan", "GS fused export: ring '${ring.ringId}' has no frames, excluding from fused dataset")
            continue
        }
        val maskDir = ringMaskDir(context, project.projectId, ring.ringId)
        val alphaFiles = (0 until frameCount).map { i -> File(maskDir, "frame-${i.toFrameNumber()}-alpha.png") }
        if (!alphaFiles.all { it.exists() }) {
            Log.d("ForgeScan", "GS fused export: ring '${ring.ringId}' is not masked yet, excluding from fused dataset")
            continue
        }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(alphaFiles[0].absolutePath, bounds)
        val width = bounds.outWidth
        val height = bounds.outHeight
        if (width <= 0 || height <= 0) continue

        val elevationDegrees = if (ring.ringId == reference.ringId) {
            referenceElevation
        } else {
            (estimateRingElevationDegrees(context, project.projectId, ring) ?: ringElevationFallbackDegrees(ring.ringId)).toDouble()
        }
        val measuredAzimuth = measuredAzimuthDegrees(context, project.projectId, ring)
        val azimuthDegrees = measuredAzimuth ?: DoubleArray(frameCount) { i -> i.toDouble() / frameCount * 360.0 }
        val ringSilhouettes = loadRingSilhouettes(context, project, ring)
        val radius = estimateOrbitRadius(ringSilhouettes)

        val offsets = if (ring.ringId == reference.ringId) {
            0.0 to 0.0
        } else {
            // Registration is re-solved here rather than trusting
            // detectRingGroups' earlier verdict, since RANSAC-based
            // essential-matrix estimation isn't perfectly deterministic
            // run-to-run - a ring that grouped successfully during Process
            // could, rarely, fail to re-register at export time. Excluding
            // it then (rather than exporting with a stale/guessed offset) is
            // the same "honest null over a confident guess" policy as
            // everywhere else in this pipeline.
            val registration = registerRings(context, project.projectId, reference, referenceElevation, ring, elevationDegrees)
            if (registration == null) {
                Log.d(
                    "ForgeScan",
                    "GS fused export: ring '${ring.ringId}' did not re-register against reference '${reference.ringId}' " +
                        "at export time - excluding it from the fused dataset",
                )
                null
            } else {
                registration.azimuthPhaseOffsetDegrees to registration.verticalOffset
            }
        }
        if (offsets == null) continue

        plans += RingPlan(ring, elevationDegrees, azimuthDegrees, radius, width, height, estimateFocalLengthPixels(width, height), offsets.first, offsets.second)
    }

    require(plans.isNotEmpty()) { "No ring in this group could be exported (masking or registration failed for all of them)." }
    if (plans.size == 1) {
        Log.d("ForgeScan", "GS fused export: only '${plans[0].ring.ringId}' survived export-time checks - writing as a single-ring dataset")
    }

    outputDir.mkdirs()
    val imagesDir = File(outputDir, "images").apply { mkdirs() }
    val framesJson = JSONArray()
    val allPoints = ArrayList<SeedPoint>()

    for (plan in plans) {
        val maskDir = ringMaskDir(context, project.projectId, plan.ring.ringId)
        val frameCount = plan.ring.frames.size
        for (i in 0 until frameCount) {
            val srcFile = File(maskDir, "frame-${i.toFrameNumber()}-alpha.png")
            // Per-ring filename prefix - frame indices from different rings
            // would otherwise collide inside one shared images/ folder.
            val destName = "${plan.ring.ringId}-frame-${i.toFrameNumber()}.png"
            srcFile.copyTo(File(imagesDir, destName), overwrite = true)

            val effectiveAzimuth = plan.azimuthDegrees[i] + plan.phaseOffsetDegrees
            val transform = buildFrameTransform(plan.elevationDegrees, effectiveAzimuth, plan.radius)
            // The registration's vertical offset is a translation layered on
            // top of the otherwise-unchanged orbit, not baked into
            // buildFrameTransform's own spherical geometry.
            transform[1][3] += plan.verticalOffset
            framesJson.put(
                JSONObject().apply {
                    put("file_path", "images/$destName")
                    put("transform_matrix", JSONArray().apply { transform.forEach { row -> put(JSONArray(row)) } })
                },
            )
        }

        // mesh, when given, already carries every carved ring's contribution
        // merged into one coherent cloud in the shared canonical frame - the
        // carve itself applied each ring's phaseOffsetDegrees before meshing
        // (ReconstructionPipeline.kt), so rebuilding per-ring sparse points
        // and re-applying that same offset here would double-transform them.
        if (mesh == null) {
            val points = buildSeedPointCloud(context, project.projectId, plan.ring, plan.azimuthDegrees)
            val phaseRotation = rotationAroundY(Math.toRadians(plan.phaseOffsetDegrees))
            for (p in points) {
                val rotated = phaseRotation.apply3x3(p.position)
                allPoints += SeedPoint(Vec3(rotated.x, rotated.y + plan.verticalOffset, rotated.z), p.r, p.g, p.b)
            }
        }
    }
    if (mesh != null) {
        Log.d("ForgeScan", "GS fused export points.ply: seeding from carved+colorized mesh instead of merged sparse SfM points")
        allPoints += meshSeedPoints(mesh)
    }

    // Shared top-level intrinsics assume every ring in the group was
    // captured at the same resolution - true for every capture this app
    // itself produces (one device, one session), so not enforced further.
    val reference0 = plans[0]
    val transformsJson = JSONObject().apply {
        put("w", reference0.width)
        put("h", reference0.height)
        put("fl_x", reference0.focal)
        put("fl_y", reference0.focal)
        put("cx", reference0.width / 2.0)
        put("cy", reference0.height / 2.0)
        put("camera_model", "OPENCV")
        put("frames", framesJson)
    }
    File(outputDir, "transforms.json").writeText(transformsJson.toString(2))
    writePly(allPoints, File(outputDir, "points.ply"))

    Log.i(
        "ForgeScan",
        "GS fused export: wrote ${plans.sumOf { it.ring.frames.size }} frame(s) from ${plans.size} ring(s) " +
            "(${plans.joinToString { it.ring.ringId }}), ${allPoints.size} seed point(s)",
    )
}

// Real, measured per-frame azimuth - or null to signal "fall back to the
// uniform i/N*360 assumption", the same weaker-but-safe model carving uses.
// Returning null (rather than a best-effort guess) whenever the measurement
// is unavailable or fails its own sanity check is deliberate: a GS trainer's
// photo-consistency loss has no equivalent of carving's 97%-agreement
// tolerance, so a subtly-wrong measured track is worse than an honestly
// weaker uniform one.
private fun measuredAzimuthDegrees(context: Context, projectId: String, ring: ForgeScanRing): DoubleArray? {
    val frameCount = ring.frames.size
    val measurements = measureRingPairs(context, projectId, ring)
    if (measurements.size < 2) {
        Log.d("ForgeScan", "GS export azimuth: falling back to uniform (only ${measurements.size} usable pair measurement(s))")
        return null
    }

    // A recovered (axis, angle) pair is only defined up to the (axis, angle)
    // <-> (-axis, -angle) ambiguity - two segments measured independently
    // can come back describing the same real rotation sense with opposite
    // signs. Without re-expressing every segment relative to one shared
    // reference direction first, summing them would mix signs and the chain
    // wouldn't track cumulative rotation at all (this is the piece the
    // original reverted experiment in TurntableGeometry.kt didn't have).
    val axes = measurements.map { Vec3(it.axis.first, it.axis.second, it.axis.third) }
    val medianAxis = medianAxisOf(axes)

    val segmentDegrees = ArrayList<Double>()
    val segmentEndIndices = ArrayList<Int>()
    for (m in measurements) {
        val axis = Vec3(m.axis.first, m.axis.second, m.axis.third)
        val sign = if (axis.dot(medianAxis) < 0.0) -1.0 else 1.0
        segmentDegrees += sign * Math.toDegrees(m.angleRadians)
        segmentEndIndices += m.endIndex
    }

    // measureRingPairs' own stride loop ("while index + stride < frameCount")
    // can stop short of the last frame - extrapolate one final segment at the
    // chain's own average per-frame rate so every frame index ends up inside
    // some segment's span before loop closure runs.
    val lastCoveredIndex = segmentEndIndices.last()
    if (lastCoveredIndex < frameCount - 1 && lastCoveredIndex > 0) {
        val avgDegreesPerFrame = segmentDegrees.sum() / lastCoveredIndex
        val tailFrames = (frameCount - 1) - lastCoveredIndex
        segmentDegrees += avgDegreesPerFrame * tailFrames
        segmentEndIndices += frameCount - 1
    }

    val rawTotal = segmentDegrees.sum()
    val corrected = applyLoopClosure(segmentDegrees, 360.0)
    val residual = 360.0 - rawTotal
    Log.d(
        "ForgeScan",
        "GS export azimuth: measured path, pre-correction total=$rawTotal deg over ${segmentDegrees.size} segments, loop-closure residual=$residual deg",
    )

    val perFrame = interpolateKeyframeAngles(segmentEndIndices, corrected, frameCount)

    // A badly-conditioned pair chain (too little texture, a near-degenerate
    // essential matrix) can still clear measurePair's own inlier threshold
    // and produce nonsense angles. Guard the two ways that would break a GS
    // trainer - a track that runs backwards somewhere, or a pre-correction
    // total wildly far from a real 360-degree turntable revolution - rather
    // than silently exporting a corrupt trajectory.
    val monotonic = (1 until perFrame.size).all { perFrame[it] > perFrame[it - 1] }
    val totalPlausible = abs(rawTotal - 360.0) < 90.0
    if (!monotonic || !totalPlausible) {
        Log.d("ForgeScan", "GS export azimuth: measured path failed sanity check (monotonic=$monotonic, totalPlausible=$totalPlausible) - falling back to uniform")
        return null
    }
    return perFrame
}

private fun medianAxisOf(axes: List<Vec3>): Vec3 {
    val xs = axes.map { it.x }.sorted()
    val ys = axes.map { it.y }.sorted()
    val zs = axes.map { it.z }.sorted()
    val mid = axes.size / 2
    return Vec3(xs[mid], ys[mid], zs[mid]).normalized()
}

// Cumulative-sums per-segment angles and distributes the 360-degree closure
// residual proportionally across keyframes. If every segment carries the
// same constant additive bias b (the failure mode diagnosed in
// TurntableGeometry.kt's reverted experiment), the raw cumulative angle at
// keyframe k is trueCumulative_k + k*b, the total residual is exactly -K*b,
// and adding residual*(k/K) to keyframe k cancels the k*b term exactly -
// recovering the true cumulative angle at every keyframe, not just at the
// end. It does not fully undo independent per-segment noise (only a shared
// bias), which is why measuredAzimuthDegrees still sanity-checks the result
// afterward instead of trusting the correction blindly.
internal fun applyLoopClosure(segmentAnglesDegrees: List<Double>, expectedTotalDegrees: Double = 360.0): List<Double> {
    require(segmentAnglesDegrees.isNotEmpty()) { "Need at least one segment." }
    val k = segmentAnglesDegrees.size
    val cumulative = DoubleArray(k)
    var running = 0.0
    for (i in 0 until k) {
        running += segmentAnglesDegrees[i]
        cumulative[i] = running
    }
    val residual = expectedTotalDegrees - cumulative[k - 1]
    return (0 until k).map { i -> cumulative[i] + residual * ((i + 1).toDouble() / k) }
}

// Linear-interpolates a per-frame azimuth curve from sparse measured
// keyframes. Frame 0 is always angle 0 (the canonical reference frame,
// matching TurntableGeometry's own i=0 => 0deg convention) even though it
// isn't a keyframe itself.
internal fun interpolateKeyframeAngles(
    keyframeFrameIndices: List<Int>,
    keyframeCumulativeDegrees: List<Double>,
    totalFrameCount: Int,
): DoubleArray {
    require(keyframeFrameIndices.size == keyframeCumulativeDegrees.size) { "Indices and angles must line up 1:1." }
    require(keyframeFrameIndices.isNotEmpty())
    val indices = listOf(0) + keyframeFrameIndices
    val angles = listOf(0.0) + keyframeCumulativeDegrees
    val result = DoubleArray(totalFrameCount)
    var segment = 0
    for (frame in 0 until totalFrameCount) {
        while (segment < indices.size - 2 && frame > indices[segment + 1]) segment++
        val i0 = indices[segment]
        val i1 = indices[segment + 1]
        val a0 = angles[segment]
        val a1 = angles[segment + 1]
        result[frame] = if (i1 == i0) a0 else a0 + (a1 - a0) * (frame - i0).toDouble() / (i1 - i0)
    }
    return result
}

// Apparent-size radius estimate: ring.halfExtent (from loadRingSilhouettes,
// the same union-bbox logic the carve normalizes silhouettes against) is
// already "how much of the frame's half-width the object's projected
// footprint occupies," so multiplying by the assumed half-FOV gives the
// object's half-angular-extent as seen by the camera - and for an object of
// unit half-extent, radius = 1/tan(that angle).
// TEMPORARY diagnostic logging (Log.d) added to trace a suspected radius
// under/over-estimate on the tilted-ring capture - remove once the root
// cause of the bad GS training result is confirmed and fixed.
private fun estimateOrbitRadius(ringSilhouettes: RingSilhouettes?): Double {
    if (ringSilhouettes == null) {
        Log.d("ForgeScan", "GS export radius: ringSilhouettes=null, using default R=$DefaultRadius")
        return DefaultRadius
    }
    val halfAngularExtent = ringSilhouettes.halfExtent * Math.toRadians(AssumedHorizontalFovDegrees / 2.0)
    if (halfAngularExtent <= 0.0 || halfAngularExtent >= PI / 2.0) {
        Log.d(
            "ForgeScan",
            "GS export radius: halfExtent=${ringSilhouettes.halfExtent} -> halfAngularExtent=$halfAngularExtent rad " +
                "out of (0, PI/2) range, using default R=$DefaultRadius",
        )
        return DefaultRadius
    }
    val rawR = 1.0 / tan(halfAngularExtent)
    val clampedR = if (rawR.isNaN() || rawR.isInfinite()) DefaultRadius else rawR.coerceIn(MinRadius, MaxRadius)
    Log.d(
        "ForgeScan",
        "GS export radius: silhouette union-bbox halfExtent=${ringSilhouettes.halfExtent} (fraction of frame half-width), " +
            "assumedHFOV=$AssumedHorizontalFovDegrees deg -> halfAngularExtent=${Math.toDegrees(halfAngularExtent)} deg, " +
            "raw pre-clamp R=$rawR (assumes object canonical half-extent=1.0), clamped R=$clampedR " +
            "(clamp range [$MinRadius, $MaxRadius])",
    )
    return clampedR
}

private fun buildFrameTransform(elevationDegrees: Double, azimuthDegrees: Double, radius: Double): Array<DoubleArray> {
    val elevationRad = Math.toRadians(elevationDegrees)
    val azimuthRad = Math.toRadians(azimuthDegrees)
    val horizontalR = radius * cos(elevationRad)
    val cameraPos = Vec3(
        horizontalR * cos(azimuthRad),
        radius * sin(elevationRad),
        horizontalR * sin(azimuthRad),
    )
    return buildLookAtCameraToWorld(cameraPos, Vec3(0.0, 0.0, 0.0), Vec3(0.0, 1.0, 0.0))
}

// Camera-to-world matrix in OpenGL/Blender convention (camera looks down its
// own -Z with +Y up) - the convention nerfstudio's transforms.json expects.
// This differs from OpenCV's pose-recovery convention used elsewhere in
// TurntableSfm.kt (+Z forward): this function synthesizes a fresh pose from
// elevation/azimuth/radius rather than converting an OpenCV rotation matrix,
// but the distinction matters if an OpenCV pose is ever wired through here
// directly in the future.
internal fun buildLookAtCameraToWorld(cameraPos: Vec3, target: Vec3, upHint: Vec3): Array<DoubleArray> {
    val forward = (target - cameraPos).normalized()
    // Near-degenerate at a near-90-degree elevation ring, where forward is
    // nearly parallel to the default +Y up hint and "right" would collapse
    // toward a zero vector - fall back to a different hint axis.
    val safeUpHint = if (abs(forward.dot(upHint)) > 0.999) Vec3(1.0, 0.0, 0.0) else upHint
    val right = forward.cross(safeUpHint).normalized()
    val camUp = right.cross(forward).normalized()
    // OpenGL convention: camera-space -Z is "forward", so the world-space
    // column for the camera's +Z axis is -forward.
    return arrayOf(
        doubleArrayOf(right.x, camUp.x, -forward.x, cameraPos.x),
        doubleArrayOf(right.y, camUp.y, -forward.y, cameraPos.y),
        doubleArrayOf(right.z, camUp.z, -forward.z, cameraPos.z),
        doubleArrayOf(0.0, 0.0, 0.0, 1.0),
    )
}

private fun buildTransformsJson(
    width: Int,
    height: Int,
    focal: Double,
    elevationDegrees: Double,
    perFrameAzimuthDegrees: DoubleArray,
    radius: Double,
    frameCount: Int,
): JSONObject = JSONObject().apply {
    put("w", width)
    put("h", height)
    put("fl_x", focal)
    put("fl_y", focal)
    put("cx", width / 2.0)
    put("cy", height / 2.0)
    put("camera_model", "OPENCV")
    put(
        "frames",
        JSONArray().apply {
            for (i in 0 until frameCount) {
                val transform = buildFrameTransform(elevationDegrees, perFrameAzimuthDegrees[i], radius)
                put(
                    JSONObject().apply {
                        put("file_path", "images/frame-${i.toFrameNumber()}.png")
                        put("transform_matrix", JSONArray().apply { transform.forEach { row -> put(JSONArray(row)) } })
                    },
                )
            }
        },
    )
}

// Seeds points.ply from the same triangulated features TurntableSfm.kt
// already computes - each pair's points are re-expressed in the shared
// canonical frame (spin axis -> +Y, rotated to that pair's own start
// azimuth, centroid at origin) so pairs merge into one coherent cloud instead
// of each sitting in its own unrelated local frame.
private fun buildSeedPointCloud(context: Context, projectId: String, ring: ForgeScanRing, perFrameAzimuthDegrees: DoubleArray?): List<SeedPoint> {
    val measurements = measureRingPairs(context, projectId, ring)
    if (measurements.isEmpty()) {
        Log.d("ForgeScan", "GS export points.ply: no measurements available, writing a random seed cloud")
        return randomSeedCloud()
    }

    val allPoints = ArrayList<Vec3>()
    for (m in measurements) {
        val axis = Vec3(m.axis.first, m.axis.second, m.axis.third).normalized()
        val rawPoints = m.points.map { Vec3(it.first, it.second, it.third) }
        if (rawPoints.size < 3) continue

        val centroid = rawPoints.reduce { a, b -> a + b } * (1.0 / rawPoints.size)
        val recentered = rawPoints.map { it - centroid }

        // Pair scales are mutually inconsistent (two-view triangulation only
        // recovers structure up to an unknown scale) - normalizing by this
        // pair's own median radial distance from its own axis (the same
        // quantity TurntableSfm.kt's capRatiosFromPoints calls bodyRadius)
        // puts every pair's points on one shared, comparable scale.
        val radii = recentered.map { p ->
            val h = p.dot(axis)
            (p - axis * h).length()
        }
        val bodyRadius = radii.sorted()[radii.size / 2]
        if (bodyRadius < 1e-9) continue
        val scale = 1.0 / bodyRadius

        val alignToY = rotationAligning(axis, Vec3(0.0, 1.0, 0.0))
        val startAzimuthDegrees = perFrameAzimuthDegrees?.getOrNull(m.startIndex) ?: 0.0
        val spin = rotationAroundY(Math.toRadians(startAzimuthDegrees))

        for (p in recentered) {
            val scaled = p * scale
            val aligned = alignToY.apply3x3(scaled)
            allPoints += spin.apply3x3(aligned)
        }
    }

    if (allPoints.isEmpty()) {
        Log.d("ForgeScan", "GS export points.ply: measurements present but no usable points, writing a random seed cloud")
        return randomSeedCloud()
    }

    // The per-pair normalization above only reconciles pairs' mutually
    // inconsistent SfM scales with EACH OTHER - it says nothing about how
    // that shared pair-local scale relates to estimateOrbitRadius's own
    // convention (silhouette-derived object half-extent = 1.0), which is
    // what places the cameras. Confirmed empirically on a real capture:
    // cameras sitting at R=1.5 against a merged cloud whose own p95
    // distance-from-origin was 5.57 (max 24.6) - the camera was effectively
    // inside the seed cloud, not orbiting it. Rescaling the whole merged
    // cloud (not per-pair - the pairs are already on one shared scale by
    // this point) by its own outer-extent statistic brings it into the same
    // "half-extent ~= 1.0" convention the camera radius already assumes.
    val distances = allPoints.map { it.length() }.sorted()
    val outerExtentBefore = percentile(distances, 0.95)
    Log.d(
        "ForgeScan",
        "GS export points.ply: pre-rescale p95 distance-from-origin=$outerExtentBefore (of ${allPoints.size} points, max=${distances.last()})",
    )

    // p95, not max: a triangulation artifact several times further out than
    // the 95th percentile has no real business seeding a Gaussian regardless
    // of scale, and dividing by an outlier-contaminated max would shrink the
    // whole cloud around a single bad point. Dropping outliers outright
    // (rather than just rescaling around them) also avoids wasting
    // densification budget on them.
    val outlierThreshold = outerExtentBefore * 3.0
    val keptPoints = ArrayList<Vec3>()
    var droppedCount = 0
    for (p in allPoints) {
        if (p.length() > outlierThreshold) droppedCount++ else keptPoints += p
    }
    Log.d("ForgeScan", "GS export points.ply: dropped $droppedCount point(s) beyond 3x p95 (threshold=$outlierThreshold)")

    val rescaled = if (outerExtentBefore > 1e-9) keptPoints.map { it * (1.0 / outerExtentBefore) } else keptPoints
    val outerExtentAfter = percentile(rescaled.map { it.length() }.sorted(), 0.95)
    Log.d("ForgeScan", "GS export points.ply: post-rescale p95 distance-from-origin=$outerExtentAfter (should be ~1.0)")

    val trimmed = if (rescaled.size > MaxSeedPoints) rescaled.shuffled(Random(0)).take(MaxSeedPoints) else rescaled
    // No real per-point color is available from sparse triangulated
    // features (unlike the mesh-seeded path below) - flat gray, same as the
    // long-standing default before mesh seeding existed.
    return trimmed.map { SeedPoint(it, 180, 180, 180) }
}

// Dense per-vertex seed cloud straight from the mesh runReconstructionPipeline
// already carved and colorized for these exact ring(s) - meshFromVoxelGrid
// and colorizeMesh both work in the same canonical frame (spin axis = +Y,
// object half-extent ~= 1.0) that estimateOrbitRadius's camera placement
// assumes, so unlike the sparse SfM cloud above, these points need no
// per-pair rescaling to land at the right scale relative to the camera
// track - they were built in that frame from the start. Real per-vertex
// color (already baked by MeshColorizer.kt) replaces the flat gray
// placeholder too, and there are typically far more of these points than
// sparse ORB-triangulated features, giving the trainer's nearest-neighbor
// scale/density initialization a much richer starting point.
private fun meshSeedPoints(mesh: ForgeScanMesh): List<SeedPoint> {
    val count = mesh.positions.size / 3
    val points = ArrayList<SeedPoint>(count)
    for (i in 0 until count) {
        val position = Vec3(
            mesh.positions[i * 3].toDouble(),
            mesh.positions[i * 3 + 1].toDouble(),
            mesh.positions[i * 3 + 2].toDouble(),
        )
        val r = (mesh.colors[i * 3] * 255f).toInt().coerceIn(0, 255)
        val g = (mesh.colors[i * 3 + 1] * 255f).toInt().coerceIn(0, 255)
        val b = (mesh.colors[i * 3 + 2] * 255f).toInt().coerceIn(0, 255)
        points += SeedPoint(position, r, g, b)
    }
    Log.d("ForgeScan", "GS export points.ply: mesh seed cloud has ${points.size} point(s) (pre-cap)")
    return if (points.size > MaxSeedPoints) points.shuffled(Random(0)).take(MaxSeedPoints) else points
}

private fun percentile(sortedValues: List<Double>, fraction: Double): Double {
    if (sortedValues.isEmpty()) return 0.0
    val index = (fraction * (sortedValues.size - 1)).toInt().coerceIn(0, sortedValues.size - 1)
    return sortedValues[index]
}

private fun randomSeedCloud(): List<SeedPoint> = List(RandomSeedPointCount) {
    while (true) {
        val p = Vec3(Random.nextDouble(-1.0, 1.0), Random.nextDouble(-1.0, 1.0), Random.nextDouble(-1.0, 1.0))
        if (p.dot(p) <= 1.0) return@List SeedPoint(p, 180, 180, 180)
    }
    @Suppress("UNREACHABLE_CODE")
    SeedPoint(Vec3(0.0, 0.0, 0.0), 180, 180, 180)
}

// Rodrigues' rotation formula for the rotation taking unit vector `from`
// onto unit vector `to` - used to re-express each pair's triangulated points
// (measured relative to that pair's own arbitrary axis orientation) in the
// canonical +Y-spin-axis frame every other part of this exporter uses.
private fun rotationAligning(from: Vec3, to: Vec3): Array<DoubleArray> {
    val f = from.normalized()
    val t = to.normalized()
    val cosAngle = f.dot(t).coerceIn(-1.0, 1.0)
    if (cosAngle > 1.0 - 1e-9) return identity3x3()
    if (cosAngle < -1.0 + 1e-9) {
        val helper = if (abs(f.x) < 0.9) Vec3(1.0, 0.0, 0.0) else Vec3(0.0, 1.0, 0.0)
        val axis = f.cross(helper).normalized()
        return axisAngleToMatrix(axis, PI)
    }
    val axis = f.cross(t).normalized()
    return axisAngleToMatrix(axis, acos(cosAngle))
}

private fun identity3x3(): Array<DoubleArray> = arrayOf(
    doubleArrayOf(1.0, 0.0, 0.0),
    doubleArrayOf(0.0, 1.0, 0.0),
    doubleArrayOf(0.0, 0.0, 1.0),
)

private fun axisAngleToMatrix(axis: Vec3, angle: Double): Array<DoubleArray> {
    val x = axis.x
    val y = axis.y
    val z = axis.z
    val c = cos(angle)
    val s = sin(angle)
    val t = 1 - c
    return arrayOf(
        doubleArrayOf(t * x * x + c, t * x * y - s * z, t * x * z + s * y),
        doubleArrayOf(t * x * y + s * z, t * y * y + c, t * y * z - s * x),
        doubleArrayOf(t * x * z - s * y, t * y * z + s * x, t * z * z + c),
    )
}

private fun rotationAroundY(angleRadians: Double): Array<DoubleArray> {
    val c = cos(angleRadians)
    val s = sin(angleRadians)
    return arrayOf(
        doubleArrayOf(c, 0.0, s),
        doubleArrayOf(0.0, 1.0, 0.0),
        doubleArrayOf(-s, 0.0, c),
    )
}

private fun Array<DoubleArray>.apply3x3(v: Vec3): Vec3 = Vec3(
    this[0][0] * v.x + this[0][1] * v.y + this[0][2] * v.z,
    this[1][0] * v.x + this[1][1] * v.y + this[1][2] * v.z,
    this[2][0] * v.x + this[2][1] * v.y + this[2][2] * v.z,
)

private fun writePly(points: List<SeedPoint>, file: File) {
    file.bufferedWriter().use { out ->
        out.write("ply\n")
        out.write("format ascii 1.0\n")
        out.write("element vertex ${points.size}\n")
        out.write("property float x\n")
        out.write("property float y\n")
        out.write("property float z\n")
        out.write("property uchar red\n")
        out.write("property uchar green\n")
        out.write("property uchar blue\n")
        out.write("end_header\n")
        for (p in points) {
            out.write("${p.position.x} ${p.position.y} ${p.position.z} ${p.r} ${p.g} ${p.b}\n")
        }
    }
}
