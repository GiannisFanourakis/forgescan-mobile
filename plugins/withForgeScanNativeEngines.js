const fs = require("fs");
const path = require("path");
const {
  withDangerousMod,
  withMainApplication
} = require("@expo/config-plugins");

const packageImport = "com.forgescan.nativeengines.ForgeScanEnginesPackage";
const kotlinPackageCall = "add(ForgeScanEnginesPackage())";
const javaPackageCall = "packages.add(new ForgeScanEnginesPackage());";
const tfliteDependency = 'implementation("org.tensorflow:tensorflow-lite:2.16.1")';
const onnxRuntimeDependency = 'implementation("com.microsoft.onnxruntime:onnxruntime-android:1.18.0")';

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

  if (!contents.includes("org.tensorflow:tensorflow-lite")) {
    dependencies.push(tfliteDependency);
  }

  if (!contents.includes("com.microsoft.onnxruntime:onnxruntime-android")) {
    dependencies.push(onnxRuntimeDependency);
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
