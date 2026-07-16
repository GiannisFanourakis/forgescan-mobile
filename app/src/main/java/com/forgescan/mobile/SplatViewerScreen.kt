package com.forgescan.mobile

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileInputStream

private const val PlyEntryName = "scan.ply"

// Wraps the same GaussianSplats3D-based viewer (assets/splat_viewer.html)
// already validated against real trained splats in a desktop browser earlier
// this session - reusing that code rather than writing a native
// Gaussian-splat renderer, which would mean reimplementing anisotropic
// ellipsoid rendering, depth sorting, and spherical-harmonic shading by hand
// in OpenGL/Vulkan.
//
// The .ply is served through a WebViewAssetLoader PathHandler over a virtual
// https://appassets.androidplatform.net/ origin, not a raw file:// URL
// (modern WebView blocks arbitrary file:// access by default) and not a
// JS-bridge byte transfer (memory-prohibitive for a splat file this size -
// these have run 100-500MB in this session's own testing). The page's own
// #status text carries loading/error state, so this screen doesn't thread
// the app's busyMessage/statusMessage through - those are about other,
// unrelated operations happening back on the Capture screen.
@Composable
internal fun SplatViewerScreen(plyFile: File, onBack: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
        Text("Splat Preview", style = MaterialTheme.typography.headlineMedium)
        AndroidView(
            modifier = Modifier.fillMaxSize().weight(1f),
            factory = { context -> buildSplatWebView(context, plyFile) },
        )
        ActionButton(text = "Back", onClick = onBack, enabled = true, secondary = true)
    }
}

@SuppressLint("SetJavaScriptEnabled")
private fun buildSplatWebView(context: Context, plyFile: File): WebView {
    val assetLoader = WebViewAssetLoader.Builder()
        .setDomain("appassets.androidplatform.net")
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
        .addPathHandler("/splat-data/") { path ->
            if (path != PlyEntryName) null else WebResourceResponse("application/octet-stream", null, FileInputStream(plyFile))
        }
        .build()

    return WebView(context).apply {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)
        }
        loadUrl(
            "https://appassets.androidplatform.net/assets/splat_viewer.html" +
                "?src=https://appassets.androidplatform.net/splat-data/$PlyEntryName",
        )
    }
}
