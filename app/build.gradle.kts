import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Upload-key signing for Play App Signing. keystore.properties is gitignored;
// absent entirely on a checkout that isn't set up to sign releases, in which
// case only debug builds are available.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(keystorePropertiesFile.inputStream())
}

// Cloud backend endpoint + API key (pipeline.py's _reject_unless_authorized).
// backend.properties is gitignored, same as keystore.properties above - the
// key must not land in source control. Absent entirely on a checkout that
// isn't set up for cloud upload, in which case the cloud button's BuildConfig
// values are empty and BackendClient fails fast with a clear error rather
// than silently posting to a blank URL.
val backendPropertiesFile = rootProject.file("backend.properties")
val backendProperties = Properties()
if (backendPropertiesFile.exists()) {
    backendProperties.load(backendPropertiesFile.inputStream())
}

android {
    namespace = "com.forgescan.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.forgescan.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "BACKEND_API_KEY", "\"${backendProperties.getProperty("apiKey", "")}\"")
        buildConfigField(
            "String",
            "BACKEND_SPLAT_ENDPOINT_URL",
            "\"${backendProperties.getProperty("splatEndpointUrl", "")}\"",
        )
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all { test -> test.jvmArgs("-Xmx4g") }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.core:core:1.13.1")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("com.google.android.gms:play-services-mlkit-subject-segmentation:16.0.0-beta1")
    implementation("io.github.sceneview:sceneview:4.18.0")
    implementation("org.opencv:opencv:4.9.0")
    // Runs the SuperPoint+LightGlue learned matcher (LearnedMatcher.kt) -
    // ORB collapses on cross-ring pairs (a large elevation gap is a much
    // wider viewpoint change than ORB's hand-crafted descriptor tolerates;
    // confirmed on a real capture where 60/64 sampled cross-ring pairs found
    // no usable match at all). CPU-only build: no GPU/NNAPI execution
    // provider complexity for this first pass.
    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.22.0")
    // BackendClient.kt's cloud-upload flow - the only network call in the
    // app. Retrofit would add codegen/annotation overhead for what's really
    // two raw binary POST requests; a plain OkHttpClient is a better match.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // CloudUploadWorker.kt - runs the cloud upload as a real foreground
    // service, not an Activity-scoped coroutine, so it survives app
    // backgrounding/process death for the run's full ~15-40 minute duration
    // (this device in particular: MIUI is known for aggressively killing
    // backgrounded apps to save battery).
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    // SplatViewerScreen.kt - WebViewAssetLoader serves the bundled
    // splat_viewer.html and the downloaded .ply over a virtual https://
    // origin instead of raw file:// access (blocked by default on modern
    // WebView) or a JS-bridge byte transfer (memory-prohibitive for a
    // 100-500MB splat file).
    implementation("androidx.webkit:webkit:1.12.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
