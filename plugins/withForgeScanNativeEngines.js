const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication
} = require("@expo/config-plugins");

const packageImport = "com.forgescan.nativeengines.ForgeScanEnginesPackage";
const kotlinPackageCall = "add(ForgeScanEnginesPackage())";
const javaPackageCall = "packages.add(new ForgeScanEnginesPackage());";
const mlKitSubjectSegmentationDependency =
  'implementation("com.google.android.gms:play-services-mlkit-subject-segmentation:16.0.0-beta1")';
const arCoreDependency = 'implementation("com.google.ar:core:1.54.0")';
const cameraXCoreDependency = 'implementation("androidx.camera:camera-core:1.4.2")';
const cameraXCamera2Dependency = 'implementation("androidx.camera:camera-camera2:1.4.2")';
const cameraXLifecycleDependency =
  'implementation("androidx.camera:camera-lifecycle:1.4.2")';
const cameraXViewDependency = 'implementation("androidx.camera:camera-view:1.4.2")';
const cameraXVideoDependency = 'implementation("androidx.camera:camera-video:1.4.2")';

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error(`ForgeScan native source directory is missing: ${source}`);
  }

  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function copyModelAssets(projectRoot, platformProjectRoot) {
  const source = path.join(projectRoot, "assets", "models", "masking");
  const destination = path.join(
    platformProjectRoot,
    "app",
    "src",
    "main",
    "assets",
    "models",
    "masking"
  );

  fs.mkdirSync(destination, { recursive: true });

  if (!fs.existsSync(source)) {
    return;
  }

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.toLowerCase().endsWith(".md")) {
      continue;
    }

    fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name));
  }
}

function addAndroidEngineDependencies(platformProjectRoot) {
  const buildGradlePath = path.join(platformProjectRoot, "app", "build.gradle");

  if (!fs.existsSync(buildGradlePath)) {
    return;
  }

  let contents = fs.readFileSync(buildGradlePath, "utf8");
  const dependencies = [];

  if (!contents.includes("play-services-mlkit-subject-segmentation")) {
    dependencies.push(mlKitSubjectSegmentationDependency);
  }

  if (!contents.includes("com.google.ar:core")) {
    dependencies.push(arCoreDependency);
  }

  if (!contents.includes("androidx.camera:camera-core")) {
    dependencies.push(cameraXCoreDependency);
  }

  if (!contents.includes("androidx.camera:camera-camera2")) {
    dependencies.push(cameraXCamera2Dependency);
  }

  if (!contents.includes("androidx.camera:camera-lifecycle")) {
    dependencies.push(cameraXLifecycleDependency);
  }

  if (!contents.includes("androidx.camera:camera-view")) {
    dependencies.push(cameraXViewDependency);
  }

  if (!contents.includes("androidx.camera:camera-video")) {
    dependencies.push(cameraXVideoDependency);
  }

  if (dependencies.length === 0) {
    return;
  }

  contents = contents.replace(
    /dependencies\s*\{\n/,
    `dependencies {\n    ${dependencies.join("\n    ")}\n`
  );

  fs.writeFileSync(buildGradlePath, contents);
}

function addKotlinPackage(contents) {
  let nextContents = contents;

  if (!nextContents.includes(packageImport)) {
    nextContents = nextContents.replace(
      /import com\.facebook\.react\.PackageList\n/,
      `import com.facebook.react.PackageList\nimport ${packageImport}\n`
    );
  }

  if (nextContents.includes(kotlinPackageCall)) {
    return nextContents;
  }

  nextContents = nextContents.replace(
    /(PackageList\(this\)\.packages\.apply\s*\{\n)/,
    `$1            ${kotlinPackageCall}\n`
  );

  nextContents = nextContents.replace(
    /(val packages = PackageList\(this\)\.packages\n)/,
    `$1            ${kotlinPackageCall}\n`
  );

  return nextContents;
}

function addJavaPackage(contents) {
  let nextContents = contents;

  if (!nextContents.includes(packageImport)) {
    nextContents = nextContents.replace(
      /import com\.facebook\.react\.PackageList;\n/,
      `import com.facebook.react.PackageList;\nimport ${packageImport};\n`
    );
  }

  if (nextContents.includes(javaPackageCall)) {
    return nextContents;
  }

  nextContents = nextContents.replace(
    /(List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);\n)/,
    `$1            ${javaPackageCall}\n`
  );

  return nextContents;
}

function ensureUsesFeature(androidManifest, featureName, required) {
  const manifest = androidManifest.manifest;
  manifest["uses-feature"] = manifest["uses-feature"] || [];
  const features = manifest["uses-feature"];
  const existing = features.find(
    (feature) => feature.$?.["android:name"] === featureName
  );

  if (existing) {
    existing.$["android:required"] = required ? "true" : "false";
    return;
  }

  features.push({
    $: {
      "android:name": featureName,
      "android:required": required ? "true" : "false"
    }
  });
}

function ensureApplicationMetaData(application, name, value) {
  application["meta-data"] = application["meta-data"] || [];
  const existing = application["meta-data"].find(
    (entry) => entry.$?.["android:name"] === name
  );

  if (existing) {
    existing.$["android:value"] = value;
    return;
  }

  application["meta-data"].push({
    $: {
      "android:name": name,
      "android:value": value
    }
  });
}

function withForgeScanNativeEngines(config) {
  config = withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const source = path.join(
        modConfig.modRequest.projectRoot,
        "native",
        "android",
        "forgescan-engines",
        "src",
        "main",
        "java",
        "com",
        "forgescan",
        "nativeengines"
      );
      const destination = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "forgescan",
        "nativeengines"
      );

      copyDirectory(source, destination);
      copyModelAssets(
        modConfig.modRequest.projectRoot,
        modConfig.modRequest.platformProjectRoot
      );
      addAndroidEngineDependencies(modConfig.modRequest.platformProjectRoot);
      return modConfig;
    }
  ]);

  config = withAndroidManifest(config, (modConfig) => {
    const androidManifest = modConfig.modResults;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      androidManifest
    );

    ensureUsesFeature(androidManifest, "android.hardware.camera", false);
    ensureUsesFeature(androidManifest, "android.hardware.camera.ar", false);
    ensureApplicationMetaData(application, "com.google.ar.core", "optional");

    return modConfig;
  });

  return withMainApplication(config, (modConfig) => {
    const { modResults } = modConfig;

    modResults.contents =
      modResults.language === "kt"
        ? addKotlinPackage(modResults.contents)
        : addJavaPackage(modResults.contents);

    return modConfig;
  });
}

module.exports = withForgeScanNativeEngines;
