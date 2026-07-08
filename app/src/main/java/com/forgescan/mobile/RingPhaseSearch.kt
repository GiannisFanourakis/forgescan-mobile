package com.forgescan.mobile

import android.content.Context
import android.util.Log

// Fallback cross-ring registration that searches the ONE unknown actually
// linking two same-session turntable rings - their relative azimuth phase -
// instead of trying to measure it from sparse wide-baseline feature matches.
//
// Why this exists: registerRings (RingRegistration.kt) needs cross-ring ORB
// correspondences, and a large elevation gap between rings (the NORMAL case,
// since rings are deliberately captured far apart in elevation for hull
// coverage) is exactly where ORB matching collapses. Confirmed on a real
// 1.3deg/48.9deg capture: 60/64 sampled cross-ring pairs found no usable
// match at all, and 3 of the 4 that did recovered geometrically impossible
// angles. But feature matching is solving a much harder problem than the one
// we actually have: both rings' elevations are already measured, and both
// rings' frames are uniformly spaced around the SAME physical spin axis, so
// the relative pose of every cross-ring frame pair is fully determined up to
// ONE scalar - ring B's azimuth phase offset. A single scalar can be
// searched exhaustively and scored with global evidence (every silhouette of
// both rings at once) rather than measured from the weakest local signal
// (texture correspondence across a ~50deg viewpoint change).
//
// The score is visual-hull consistency: carve a low-res voxel hull from ring
// A alone, then for each candidate offset count how much of that hull
// survives ring B's silhouette cones at that offset. Misaligned cones
// intersect less - a wrong offset carves away hull the true offset keeps
// (the same effect that produced an unrecognizable fragment when misaligned
// rings were once carved together blindly - used here as a measurement
// signal instead of suffered as a bug). Maximizing silhouette consistency
// over circular-motion parameters is an established technique (Hernandez &
// Schmitt, "Silhouette Coherence for Camera Calibration under Circular
// Motion", PAMI 2007); this is that idea reduced to the single unknown our
// capture model leaves open. Because the search scores candidates through
// buildRingProjections - the same function the fused carve itself uses with
// the same offset parameter - the winning offset is by construction the one
// that maximizes the fused carve's own cross-ring agreement; there is no
// convention mismatch possible between "what the search found" and "what the
// carve applies".
//
// Honest-null degeneracy: a rotationally symmetric object produces the same
// silhouettes at every azimuth, so the score curve is flat and no offset is
// recoverable - but for such an object every offset also carves identically,
// so falling back to standalone treatment loses nothing. Similarly a 2-fold
// symmetric object (a plain box) peaks twice, 180deg apart, and the
// separation gate refuses to pick one. The gates below reject flat or
// ambiguous curves rather than crowning their noise maximum.

internal class PhaseSearchResult(
    val azimuthPhaseOffsetDegrees: Double,
    // World-y shift (canonical units) to apply to ring B so it lands at ring
    // A's height. This is searched jointly with the phase, not assumed:
    // each ring normalizes silhouettes to its own union bounding box, and
    // the turntable disk inflates that bbox differently at different
    // elevations (a near-level ring sees the disk edge-on as a sliver, a
    // steep ring sees it as a large ellipse extending below the object) -
    // so the object sits at a different height in each ring's normalized
    // frame. Confirmed on a real 1.3deg/48.9deg capture: with azimuth-only
    // search, even the best candidate passed only ~41% of ring A's hull
    // voxels (a true alignment should pass most of them), and that uniform
    // geometric failure flattened the azimuth signal below the confidence
    // gates. A vertical mismatch fails voxels equally at every phase
    // candidate, so it must be solved WITH the phase, not after it.
    val verticalOffsetWorld: Double,
    val peakScore: Int,
    val medianScore: Int,
    val peakToMedianRatio: Double,
    val peakToRunnerUpRatio: Double,
)

private const val CoarseStepDegrees = 4f
private const val CoarseGridSize = 40
private const val RefineGridSize = 56
private const val RefineStepDegrees = 1f
private const val RefineWindowDegrees = 6f
// Vertical-offset search range, in canonical world units (the voxel cube is
// [-1,1]). +/-0.4 tolerates the object sitting up to 40% of the half-extent
// higher/lower in one ring's normalized frame than the other's.
private const val VerticalSearchMin = -0.4f
private const val VerticalSearchMax = 0.4f
private const val VerticalSearchStep = 0.1f
private const val VerticalRefineWindow = 0.1f
private const val VerticalRefineStep = 0.05f
// Same tolerance the real fused carve runs at (ReconstructionPipeline.kt) -
// scoring with a stricter rule than the carve would judge candidates by a
// harsher standard than they'll actually be used under.
private const val PerRingAgreement = 0.97f
// A hull this small at 40^3 is a masking failure, not an object - any score
// curve computed from it would be noise shaped like a measurement.
private const val MinSurvivorVoxels = 300
// Gate values validated against the synthetic ground-truth tests in
// RingPhaseSearchTest.kt: a modestly asymmetric object (sphere + side bump)
// must clear them with margin, a rotationally symmetric object must fail
// them. Deliberately loose in the same spirit as every other measurement
// gate in this codebase - a net against gross ambiguity, not a knob tuned
// until something passes.
private const val MinPeakToMedianRatio = 1.05
private const val MinPeakToRunnerUpRatio = 1.03
// Runner-up = best score at least this far from the peak. Wide enough that a
// genuine peak's own shoulder doesn't count as a competitor, narrow enough
// that a 2-fold symmetry's second peak (180deg away) always does.
private const val RunnerUpExclusionDegrees = 60f
// Floor for refineVerticalOffsetBySilhouettes: a real alignment should pass
// most of ring A's hull, not just edge out whatever the next-worst dy
// happened to score - confirmed on a real capture that a WRONG
// azimuth/vertical combination topped out around 42% pass rate (still the
// best of a bad set of options, but not a fit worth trusting).
private const val MinVerticalRefinePassRate = 0.5
// diagnoseHorizontalOffset's search range/step (same convention as the
// vertical search) and coordinate-descent pass count - 3 alternations of
// (dy,dx,dz) is enough for each axis to see the others' latest values at
// least twice, without the cost of a full joint 3-D grid (infeasible
// on-device: a coarse 9-step grid in all three dimensions together is
// ~800x the work of one dimension alone).
private const val HorizontalSearchMin = -0.4f
private const val HorizontalSearchMax = 0.4f
private const val HorizontalSearchStep = 0.1f
private const val CoordinateDescentPasses = 3

private class SurvivorVoxels(val xs: FloatArray, val ys: FloatArray, val zs: FloatArray) {
    val size get() = xs.size
}

// Ring A's own low-res visual hull, kept as explicit voxel centers so each
// candidate offset only has to test these (typically a few thousand) voxels
// against ring B rather than re-carving the full grid. The bottom quarter
// (by the survivors' own height range) is excluded from scoring: the
// turntable plate carves in as a rotationally symmetric pedestal
// (BackgroundRemoval.kt's known turntable-inclusion imperfection), which
// passes at EVERY candidate offset and only flattens the score curve's
// peak-to-median contrast without ever changing where the peak is.
private fun carveSurvivors(ring: RingSilhouettes, gridSize: Int, maxMisses: Int): SurvivorVoxels {
    val xs = ArrayList<Float>()
    val ys = ArrayList<Float>()
    val zs = ArrayList<Float>()
    val frameCount = ring.projections.size
    for (xi in 0 until gridSize) {
        val x = (xi + 0.5f) / gridSize * 2f - 1f
        for (yi in 0 until gridSize) {
            val y = (yi + 0.5f) / gridSize * 2f - 1f
            for (zi in 0 until gridSize) {
                val z = (zi + 0.5f) / gridSize * 2f - 1f
                var misses = 0
                var pass = true
                for (f in 0 until frameCount) {
                    if (!sampleSilhouette(ring, f, x, y, z)) {
                        misses++
                        if (misses > maxMisses) {
                            pass = false
                            break
                        }
                    }
                }
                if (pass) {
                    xs += x
                    ys += y
                    zs += z
                }
            }
        }
    }
    if (ys.isEmpty()) return SurvivorVoxels(FloatArray(0), FloatArray(0), FloatArray(0))
    val minY = ys.min()
    val maxY = ys.max()
    val yCut = minY + 0.25f * (maxY - minY)
    val keptXs = ArrayList<Float>()
    val keptYs = ArrayList<Float>()
    val keptZs = ArrayList<Float>()
    for (i in xs.indices) {
        if (ys[i] >= yCut) {
            keptXs += xs[i]
            keptYs += ys[i]
            keptZs += zs[i]
        }
    }
    return SurvivorVoxels(keptXs.toFloatArray(), keptYs.toFloatArray(), keptZs.toFloatArray())
}

// dyWorld shifts each voxel's world y before sampling - "where would this
// ring-A hull voxel land in ring B's frames if ring B's vertical reference
// sat dyWorld lower". Exactly equivalent to the centerV adjustment
// loadRingSilhouettes applies when the fused carve consumes the measured
// offset (v-shift = dyWorld * cos(elevation) * halfExtent), so search and
// carve agree by construction here too.
//
// dxWorld/dzWorld are the same idea for the horizontal plane - DIAGNOSTIC
// ONLY (see diagnoseHorizontalOffset): unlike dyWorld, a horizontal shift
// does not fold into a single per-ring constant, because U and V's X/Z
// components rotate WITH each frame's azimuth angle (U=(cosA,0,sinA),
// V=(sinA*sinE,cosE,-cosA*sinE) - both depend on A). Correctly applying a
// horizontal offset to real carving would need a per-frame-varying
// correction threaded through loadRingSilhouettes/FrameProjection, not the
// single-constant centerV trick dyWorld gets away with. Defaulting both to
// 0 keeps every existing call site (the phase/vertical search) unaffected.
private fun scoreSurvivorsAgainst(
    survivors: SurvivorVoxels,
    ring: RingSilhouettes,
    maxMisses: Int,
    dyWorld: Float,
    dxWorld: Float = 0f,
    dzWorld: Float = 0f,
): Int {
    val frameCount = ring.projections.size
    var passed = 0
    for (i in 0 until survivors.size) {
        val x = survivors.xs[i] + dxWorld
        val y = survivors.ys[i] + dyWorld
        val z = survivors.zs[i] + dzWorld
        var misses = 0
        var pass = true
        for (f in 0 until frameCount) {
            if (!sampleSilhouette(ring, f, x, y, z)) {
                misses++
                if (misses > maxMisses) {
                    pass = false
                    break
                }
            }
        }
        if (pass) passed++
    }
    return passed
}

// Pure search core, separated from the Android wrapper below so the synthetic
// ground-truth tests can drive it directly with fabricated silhouettes.
// silB's own stored projections are never used - only its silhouette content
// and framing (center/halfExtent); projections are rebuilt per candidate
// offset from elevationBDegrees, exactly as the fused carve will rebuild them
// from the winning offset.
internal fun searchPhaseOffset(
    silA: RingSilhouettes,
    silB: RingSilhouettes,
    elevationBDegrees: Float,
    log: (String) -> Unit = {},
): PhaseSearchResult? {
    val framesB = silB.projections.size
    val maxMissesA = (silA.projections.size * (1f - PerRingAgreement)).toInt()
    val maxMissesB = (framesB * (1f - PerRingAgreement)).toInt()

    fun silBAt(offsetDegrees: Float) = RingSilhouettes(
        silB.ringId,
        buildRingProjections(framesB, elevationBDegrees, offsetDegrees),
        silB.silhouettes,
        silB.gridSize,
        silB.centerU,
        silB.centerV,
        silB.halfExtent,
    )

    val coarseSurvivors = carveSurvivors(silA, CoarseGridSize, maxMissesA)
    if (coarseSurvivors.size < MinSurvivorVoxels) {
        log("Phase search: only ${coarseSurvivors.size} ring-A hull voxels at $CoarseGridSize^3 (need $MinSurvivorVoxels) - aborting")
        return null
    }

    val candidateCount = (360f / CoarseStepDegrees).toInt()
    val coarseDeltas = FloatArray(candidateCount) { it * CoarseStepDegrees }
    val dyCount = ((VerticalSearchMax - VerticalSearchMin) / VerticalSearchStep).toInt() + 1
    val dyValues = FloatArray(dyCount) { VerticalSearchMin + it * VerticalSearchStep }

    // Full 2-D coarse grid. Ring B's per-candidate silhouette set only
    // depends on the azimuth, so it's built once per delta and reused
    // across every dy row.
    val coarseScores = Array(dyCount) { IntArray(candidateCount) }
    var bestDyIndex = 0
    var peakIndex = 0
    for (di in 0 until candidateCount) {
        val silBCandidate = silBAt(coarseDeltas[di])
        for (yi in 0 until dyCount) {
            val score = scoreSurvivorsAgainst(coarseSurvivors, silBCandidate, maxMissesB, dyValues[yi])
            coarseScores[yi][di] = score
            if (score > coarseScores[bestDyIndex][peakIndex]) {
                bestDyIndex = yi
                peakIndex = di
            }
        }
    }
    log("Phase search: ring-A hull=${coarseSurvivors.size} voxels (top 75% by height)")
    for (yi in 0 until dyCount) {
        log("Phase search: coarse curve dy=${dyValues[yi]} (step $CoarseStepDegrees deg): " + coarseScores[yi].joinToString(","))
    }

    // Confidence gates run on the azimuth curve AT the winning vertical
    // offset - the question is "does azimuth matter once the rings are at
    // the same height", and mixing rows would blur exactly that signal.
    val curve = coarseScores[bestDyIndex]
    val peak = curve[peakIndex]
    val peakDelta = coarseDeltas[peakIndex]
    val bestDy = dyValues[bestDyIndex]
    val median = curve.sorted()[candidateCount / 2]
    var runnerUp = 0
    for (i in 0 until candidateCount) {
        if (angularDifferenceDegrees(coarseDeltas[i].toDouble(), peakDelta.toDouble()) < RunnerUpExclusionDegrees) continue
        if (curve[i] > runnerUp) runnerUp = curve[i]
    }

    if (median <= 0 || runnerUp <= 0) {
        log("Phase search: degenerate curve (median=$median, runnerUp=$runnerUp) - aborting")
        return null
    }
    val peakToMedian = peak.toDouble() / median
    val peakToRunnerUp = peak.toDouble() / runnerUp
    val passRate = peak.toDouble() / coarseSurvivors.size
    log(
        "Phase search: coarse peak=$peak @ delta=$peakDelta deg, dy=$bestDy (pass rate=$passRate), median=$median " +
            "(ratio=$peakToMedian), runner-up beyond ${RunnerUpExclusionDegrees}deg=$runnerUp (separation=$peakToRunnerUp)",
    )
    if (peakToMedian < MinPeakToMedianRatio || peakToRunnerUp < MinPeakToRunnerUpRatio) {
        log(
            "Phase search: curve too flat/ambiguous (need ratio>=$MinPeakToMedianRatio, separation>=$MinPeakToRunnerUpRatio) - " +
                "no confident offset (symmetric object, or rings genuinely don't share a session)",
        )
        return null
    }

    val refineSurvivors = carveSurvivors(silA, RefineGridSize, maxMissesA)
    if (refineSurvivors.size < MinSurvivorVoxels) {
        log("Phase search: refine hull unexpectedly small (${refineSurvivors.size} voxels) - keeping coarse answer")
        return PhaseSearchResult(normalizeDegrees(peakDelta.toDouble()), bestDy.toDouble(), peak, median, peakToMedian, peakToRunnerUp)
    }
    var bestRefineDelta = peakDelta
    var bestRefineDy = bestDy
    var bestRefineScore = -1
    val refineScores = ArrayList<String>()
    var refineDelta = peakDelta - RefineWindowDegrees
    while (refineDelta <= peakDelta + RefineWindowDegrees) {
        val normalized = normalizeDegrees(refineDelta.toDouble()).toFloat()
        val silBCandidate = silBAt(normalized)
        var refineDy = bestDy - VerticalRefineWindow
        while (refineDy <= bestDy + VerticalRefineWindow) {
            val score = scoreSurvivorsAgainst(refineSurvivors, silBCandidate, maxMissesB, refineDy)
            refineScores += "$normalized/$refineDy:$score"
            if (score > bestRefineScore) {
                bestRefineScore = score
                bestRefineDelta = normalized
                bestRefineDy = refineDy
            }
            refineDy += VerticalRefineStep
        }
        refineDelta += RefineStepDegrees
    }
    log("Phase search: refine (step $RefineStepDegrees deg x $VerticalRefineStep dy, $RefineGridSize^3): ${refineScores.joinToString(",")}")

    return PhaseSearchResult(normalizeDegrees(bestRefineDelta.toDouble()), bestRefineDy.toDouble(), peak, median, peakToMedian, peakToRunnerUp)
}

// Android-side wrapper: loads both rings' real silhouettes and resolves ring
// B's elevation through the same path the carve itself uses, so the search
// optimizes exactly the geometry the fused carve will run with.
internal fun searchAzimuthPhaseBySilhouettes(
    context: Context,
    project: ForgeScanProject,
    ringA: ForgeScanRing,
    ringB: ForgeScanRing,
): PhaseSearchResult? {
    val silA = loadRingSilhouettes(context, project, ringA) ?: return null
    val silB = loadRingSilhouettes(context, project, ringB) ?: return null
    val elevationB = resolveRingElevationDegrees(context, project.projectId, ringB)
    val startedAt = System.currentTimeMillis()
    val result = searchPhaseOffset(silA, silB, elevationB) { Log.d("ForgeScan", it) }
    val elapsedMs = System.currentTimeMillis() - startedAt
    if (result != null) {
        Log.i(
            "ForgeScan",
            "Silhouette phase search (${ringA.ringId},${ringB.ringId}): SUCCESS - offset=${result.azimuthPhaseOffsetDegrees} deg, " +
                "verticalOffset=${result.verticalOffsetWorld} " +
                "(peak/median=${result.peakToMedianRatio}, separation=${result.peakToRunnerUpRatio}) in ${elapsedMs}ms",
        )
    } else {
        Log.i("ForgeScan", "Silhouette phase search (${ringA.ringId},${ringB.ringId}): no confident offset in ${elapsedMs}ms")
    }
    return result
}

// Re-measures JUST the vertical offset via real silhouette-hull agreement,
// holding azimuth phase fixed at a value feature-based registration already
// found. registerRings' own verticalOffset is only sin(eA)-sin(eB) - a
// coarse per-elevation guess, explicitly documented there as good enough to
// seed a point cloud but "not a claim of precise alignment" - fine for GS
// export's forgiving photometric refinement, never validated for carving.
// Confirmed on a real capture: feeding that approximation
// (verticalOffset=-0.7316, exactly sin(1.26deg)-sin(48.90deg)) into carving
// produced a visibly fragmented mesh even though 4 independent
// feature-matched pairs agreed on the phase itself. This reuses the same
// vertical search searchPhaseOffset does for its own dy dimension, just
// without re-searching azimuth too - the phase is already trusted, only the
// height needs a real measurement instead of a guess.
internal fun refineVerticalOffsetBySilhouettes(
    context: Context,
    project: ForgeScanProject,
    ringA: ForgeScanRing,
    ringB: ForgeScanRing,
    elevationBDegrees: Float,
    fixedPhaseDegrees: Float,
    log: (String) -> Unit = {},
): Double? {
    val silA = loadRingSilhouettes(context, project, ringA) ?: return null
    val silB = loadRingSilhouettes(context, project, ringB) ?: return null
    val maxMissesA = (silA.projections.size * (1f - PerRingAgreement)).toInt()
    val maxMissesB = (silB.projections.size * (1f - PerRingAgreement)).toInt()
    val survivors = carveSurvivors(silA, RefineGridSize, maxMissesA)
    if (survivors.size < MinSurvivorVoxels) {
        log("Vertical-offset refine: only ${survivors.size} ring-A hull voxels (need $MinSurvivorVoxels) - aborting")
        return null
    }

    val silBFixed = RingSilhouettes(
        silB.ringId,
        buildRingProjections(silB.projections.size, elevationBDegrees, fixedPhaseDegrees),
        silB.silhouettes, silB.gridSize, silB.centerU, silB.centerV, silB.halfExtent,
    )

    var bestDy = 0f
    var bestScore = -1
    var dy = VerticalSearchMin
    val scores = ArrayList<String>()
    while (dy <= VerticalSearchMax) {
        val score = scoreSurvivorsAgainst(survivors, silBFixed, maxMissesB, dy)
        scores += "$dy:$score"
        if (score > bestScore) {
            bestScore = score
            bestDy = dy
        }
        dy += VerticalSearchStep
    }
    log("Vertical-offset refine at fixed phase=$fixedPhaseDegrees deg (${survivors.size} hull voxels): ${scores.joinToString(",")}")
    val passRate = bestScore.toDouble() / survivors.size
    log("Vertical-offset refine: best dy=$bestDy, pass rate=$passRate")
    // A wrong phase carries no vertical offset that fits well either - this
    // floor is as much a check on the feature path's phase as it is on dy.
    if (passRate < MinVerticalRefinePassRate) {
        log("Vertical-offset refine: pass rate too low (need >=$MinVerticalRefinePassRate) - not trusting this phase/vertical combination")
        return null
    }
    return bestDy.toDouble()
}

// DIAGNOSTIC ONLY - does not feed back into carving, and registerRingsRobust
// does not change its verdict based on this. See scoreSurvivorsAgainst's
// dxWorld/dzWorld doc comment for why: a horizontal offset can't fold into
// one constant the way vertical does (U/V's X/Z components rotate WITH each
// frame's azimuth), so using this for real carving would need per-frame
// corrections threaded through loadRingSilhouettes/FrameProjection - a
// bigger change than tonight's fixes. This exists to answer one question
// when refineVerticalOffsetBySilhouettes fails: does adding horizontal
// freedom recover a real fit (evidence the true gap IS horizontal, worth
// building that support for), or does the pass rate stay low regardless
// (evidence the phase itself, or something else entirely, is the problem)?
// Alternates 1-D scans over dy/dx/dz (coordinate descent) rather than a
// full 3-D grid, which would be ~800x the work at even this coarse a step.
internal fun diagnoseHorizontalOffset(
    context: Context,
    project: ForgeScanProject,
    ringA: ForgeScanRing,
    ringB: ForgeScanRing,
    elevationBDegrees: Float,
    fixedPhaseDegrees: Float,
    log: (String) -> Unit = {},
): Triple<Double, Double, Double>? {
    val silA = loadRingSilhouettes(context, project, ringA) ?: return null
    val silB = loadRingSilhouettes(context, project, ringB) ?: return null
    val maxMissesA = (silA.projections.size * (1f - PerRingAgreement)).toInt()
    val maxMissesB = (silB.projections.size * (1f - PerRingAgreement)).toInt()
    val survivors = carveSurvivors(silA, RefineGridSize, maxMissesA)
    if (survivors.size < MinSurvivorVoxels) return null

    val silBFixed = RingSilhouettes(
        silB.ringId,
        buildRingProjections(silB.projections.size, elevationBDegrees, fixedPhaseDegrees),
        silB.silhouettes, silB.gridSize, silB.centerU, silB.centerV, silB.halfExtent,
    )

    fun scanDy(dx: Float, dz: Float): Pair<Float, Int> {
        var best = 0f
        var bestScore = -1
        var v = HorizontalSearchMin
        while (v <= HorizontalSearchMax) {
            val score = scoreSurvivorsAgainst(survivors, silBFixed, maxMissesB, dyWorld = v, dxWorld = dx, dzWorld = dz)
            if (score > bestScore) {
                bestScore = score
                best = v
            }
            v += HorizontalSearchStep
        }
        return best to bestScore
    }
    fun scanDx(dy: Float, dz: Float): Pair<Float, Int> {
        var best = 0f
        var bestScore = -1
        var v = HorizontalSearchMin
        while (v <= HorizontalSearchMax) {
            val score = scoreSurvivorsAgainst(survivors, silBFixed, maxMissesB, dyWorld = dy, dxWorld = v, dzWorld = dz)
            if (score > bestScore) {
                bestScore = score
                best = v
            }
            v += HorizontalSearchStep
        }
        return best to bestScore
    }
    fun scanDz(dy: Float, dx: Float): Pair<Float, Int> {
        var best = 0f
        var bestScore = -1
        var v = HorizontalSearchMin
        while (v <= HorizontalSearchMax) {
            val score = scoreSurvivorsAgainst(survivors, silBFixed, maxMissesB, dyWorld = dy, dxWorld = dx, dzWorld = v)
            if (score > bestScore) {
                bestScore = score
                best = v
            }
            v += HorizontalSearchStep
        }
        return best to bestScore
    }

    var dy = 0f
    var dx = 0f
    var dz = 0f
    var lastScore = -1
    repeat(CoordinateDescentPasses) { pass ->
        val (newDy, dyScore) = scanDy(dx, dz)
        dy = newDy
        val (newDx, dxScore) = scanDx(dy, dz)
        dx = newDx
        val (newDz, dzScore) = scanDz(dy, dx)
        dz = newDz
        lastScore = dzScore
        log("Horizontal-offset diagnostic pass $pass: dy=$dy(score=$dyScore) dx=$dx(score=$dxScore) dz=$dz(score=$dzScore) of ${survivors.size}")
    }
    val passRate = lastScore.toDouble() / survivors.size
    log("Horizontal-offset diagnostic: converged dx=$dx dy=$dy dz=$dz, pass rate=$passRate")
    return Triple(dx.toDouble(), dy.toDouble(), dz.toDouble())
}

// The registration entry point the pipeline/detection/export should all use:
// feature-based phase first (when its sparse evidence exists it's precise
// and cheap to find), cross-checked against real silhouette-hull agreement
// for the vertical offset (see refineVerticalOffsetBySilhouettes) rather
// than trusting the feature path's own coarse approximation for carving.
// Falls back to the full silhouette phase search when feature matching
// finds nothing, for the common wide-elevation-gap case where cross-ring
// feature matching collapses entirely.
internal fun registerRingsRobust(
    context: Context,
    project: ForgeScanProject,
    ringA: ForgeScanRing,
    elevationADegrees: Double,
    ringB: ForgeScanRing,
    elevationBDegrees: Double,
): RingRegistration? {
    val featureResult = registerRings(context, project.projectId, ringA, elevationADegrees, ringB, elevationBDegrees)
    if (featureResult != null) {
        val refinedVertical = refineVerticalOffsetBySilhouettes(
            context, project, ringA, ringB,
            elevationBDegrees.toFloat(), featureResult.azimuthPhaseOffsetDegrees.toFloat(),
        ) { Log.d("ForgeScan", it) }
        if (refinedVertical == null) {
            // Diagnostic-only: tells us WHY it failed (see
            // diagnoseHorizontalOffset's doc comment) without changing this
            // function's verdict - carving still can't consume a horizontal
            // offset, so the honest answer here is still null either way.
            val diagnostic = diagnoseHorizontalOffset(
                context, project, ringA, ringB,
                elevationBDegrees.toFloat(), featureResult.azimuthPhaseOffsetDegrees.toFloat(),
            ) { Log.d("ForgeScan", it) }
            Log.i(
                "ForgeScan",
                "Ring registration (${ringA.ringId},${ringB.ringId}): feature path found phase=" +
                    "${featureResult.azimuthPhaseOffsetDegrees} deg, but silhouette agreement couldn't confirm any vertical " +
                    "fit at that phase - NOT registered (honest null over carving with an unvalidated alignment). " +
                    "Horizontal-offset diagnostic: ${diagnostic?.let { "dx=${it.first} dy=${it.second} dz=${it.third}" } ?: "inconclusive"}",
            )
            return null
        }
        return RingRegistration(
            ringAId = featureResult.ringAId,
            ringBId = featureResult.ringBId,
            azimuthPhaseOffsetDegrees = featureResult.azimuthPhaseOffsetDegrees,
            verticalOffset = refinedVertical,
            pairsAttempted = featureResult.pairsAttempted,
            pairsSucceeded = featureResult.pairsSucceeded,
            phaseResidualDegrees = featureResult.phaseResidualDegrees,
            verticalOffsetMeasured = true,
        )
    }
    val search = searchAzimuthPhaseBySilhouettes(context, project, ringA, ringB) ?: return null
    return RingRegistration(
        ringAId = ringA.ringId,
        ringBId = ringB.ringId,
        azimuthPhaseOffsetDegrees = search.azimuthPhaseOffsetDegrees,
        // Measured jointly with the phase, in the carve's own canonical
        // world units - safe to feed back into carving
        // (loadRingSilhouettes' verticalOffsetWorld convention).
        verticalOffset = search.verticalOffsetWorld,
        // The pair-count fields describe the feature path's evidence; the
        // silhouette path's own evidence (score curve, ratios) is in its log
        // lines. Zeroed rather than repurposed so a log reader never
        // mistakes one mechanism's stats for the other's.
        pairsAttempted = 0,
        pairsSucceeded = 0,
        phaseResidualDegrees = RefineStepDegrees.toDouble(),
        verticalOffsetMeasured = true,
    )
}
