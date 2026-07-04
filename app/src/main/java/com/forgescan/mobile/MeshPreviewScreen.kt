package com.forgescan.mobile

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.google.android.filament.LightManager
import io.github.sceneview.SceneView
import io.github.sceneview.math.Direction
import io.github.sceneview.math.Position
import io.github.sceneview.node.LightNode
import io.github.sceneview.node.ModelNode
import io.github.sceneview.rememberCameraManipulator
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberEnvironment
import io.github.sceneview.rememberEnvironmentLoader
import io.github.sceneview.rememberModelLoader
import java.io.File

@Composable
internal fun MeshPreviewScreen(
    glbFile: File,
    busyMessage: String?,
    statusMessage: String?,
    onSaveGlb: () -> Unit,
    onShareGlb: () -> Unit,
    onExportObj: () -> Unit,
    onBack: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
        Text("Preview", style = MaterialTheme.typography.headlineMedium)
        val engine = rememberEngine()
        val modelLoader = rememberModelLoader(engine)
        val environmentLoader = rememberEnvironmentLoader(engine)
        // The neutral default environment (no bundled HDR) only supplies weak
        // ambient IBL - per SceneView's own lighting recipe, real visibility
        // needs an explicit directional LightNode combined with it, not IBL
        // alone.
        val environment = rememberEnvironment(environmentLoader)
        // ModelLoader.createModelInstance(File) is a direct, synchronous overload
        // (confirmed from the library's own source) - no need to round-trip
        // through a path string, which sidesteps ambiguity about exactly what
        // string formats the asset/URL/file-path resolver actually accepts.
        val loadResult = remember(glbFile) { runCatching { modelLoader.createModelInstance(glbFile) } }
        val modelInstance = loadResult.getOrNull()
        val loadError = loadResult.exceptionOrNull()?.message
        // SceneView's own sample app never renders without an explicit
        // cameraManipulator - there is no default framing that reliably
        // points at arbitrary content, so without one the scene can render
        // (the Filament render loop runs fine) with nothing actually in view.
        // The mesh sits in a roughly [-1,1] canonical cube. Framed too small
        // on screen, its ~104k triangles average only a couple of pixels
        // each - standard rasterization only shades a pixel when its center
        // falls inside a triangle, so a mesh this fine relative to a small
        // on-screen footprint aliases into sparse dots rather than a filled
        // surface, regardless of lighting or color. Framing it larger (closer
        // camera) gives each triangle enough screen area to rasterize solid.
        val cameraManipulator = rememberCameraManipulator(
            orbitHomePosition = Position(0f, 0.3f, 1.8f),
            targetPosition = Position(0f, 0f, 0f),
        )

        SceneView(
            modifier = Modifier.fillMaxWidth().weight(1f),
            engine = engine,
            modelLoader = modelLoader,
            environmentLoader = environmentLoader,
            environment = environment,
            cameraManipulator = cameraManipulator,
        ) {
            modelInstance?.let { instance ->
                ModelNode(modelInstance = instance, scaleToUnits = 2.5f)
            }
            // A carved, non-convex shape has facets facing every direction -
            // one or two directional lights only cover a narrow slice of
            // those normals, so most of the surface stays unlit and only the
            // handful of facets that happen to align with a light read as
            // isolated bright specks. Six lights, one aimed inward along each
            // axis, approximate even all-around coverage without needing to
            // bundle an HDR environment asset.
            listOf(
                Direction(-1f, 0f, 0f), Direction(1f, 0f, 0f),
                Direction(0f, -1f, 0f), Direction(0f, 1f, 0f),
                Direction(0f, 0f, -1f), Direction(0f, 0f, 1f),
            ).forEach { lightDirection ->
                LightNode(
                    type = LightManager.Type.DIRECTIONAL,
                    intensity = 40_000f,
                    direction = lightDirection,
                )
            }
        }
        ActionButton(text = "Save GLB to Downloads", onClick = onSaveGlb, enabled = busyMessage == null)
        ActionButton(text = "Share GLB", onClick = onShareGlb, enabled = busyMessage == null, secondary = true)
        ActionButton(text = "Export OBJ (.zip)", onClick = onExportObj, enabled = busyMessage == null, secondary = true)
        ActionButton(text = "Back", onClick = onBack, enabled = busyMessage == null, secondary = true)
        loadError?.let { Text("Preview load failed: $it", color = AppSecondary) }
        busyMessage?.let { Text(it, color = AppSecondary) }
        statusMessage?.let { Text(it, color = AppMuted) }
    }
}
