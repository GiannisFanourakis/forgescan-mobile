const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const maskingDir = path.join(repoRoot, "assets", "models", "masking");
const onnxTargetPath = path.join(maskingDir, "birefnet.onnx");
const tfliteTargetPath = path.join(maskingDir, "birefnet.tflite");
const officialTinyOnnxUrl =
  "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx";

const args = process.argv.slice(2);
const options = parseArgs(args);

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  if (options.help) {
    printHelp();
    return;
  }

  const isInstallRun = process.env.npm_lifecycle_event === "model:birefnet:install";
  const source = options.source || (isInstallRun ? officialTinyOnnxUrl : "");

  if (source) {
    await installModel(source);
  }

  const validation = validateInstalledModel(options.sha256);
  if (validation.ok) {
    console.log(`BiRefNet model ready: ${validation.path}`);
    console.log(`Format: ${validation.format}`);
    console.log(`Size: ${validation.size} bytes`);
    console.log(`SHA256: ${validation.sha256}`);
    return;
  }

  console.error(validation.message);
  console.error("");
  console.error("Install the official BiRefNet ONNX model with:");
  console.error("  npm run model:birefnet:install");
  console.error("");
  console.error("Or install a converted local model with:");
  console.error(
    "  npm run model:birefnet:install -- --source C:\\path\\to\\birefnet.onnx"
  );
  console.error("");
  console.error("Android model targets:");
  console.error("  assets/models/masking/birefnet.onnx");
  console.error("  assets/models/masking/birefnet.tflite");
  process.exit(1);
}

function parseArgs(values) {
  const parsed = {
    source: process.env.BIREFNET_MODEL_SOURCE || process.env.BIREFNET_TFLITE_SOURCE || "",
    sha256: process.env.BIREFNET_MODEL_SHA256 || process.env.BIREFNET_TFLITE_SHA256 || "",
    help: false
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") {
      parsed.help = true;
    } else if (value === "--source") {
      parsed.source = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--source=")) {
      parsed.source = value.slice("--source=".length);
    } else if (value === "--sha256") {
      parsed.sha256 = values[index + 1] || "";
      index += 1;
    } else if (value.startsWith("--sha256=")) {
      parsed.sha256 = value.slice("--sha256=".length);
    }
  }

  return parsed;
}

function printHelp() {
  console.log("Prepare BiRefNet Android model");
  console.log("");
  console.log("Default install source:");
  console.log(`  ${officialTinyOnnxUrl}`);
  console.log("");
  console.log("Expected targets:");
  console.log(`  ${onnxTargetPath}`);
  console.log(`  ${tfliteTargetPath}`);
  console.log("");
  console.log("Install official ONNX model:");
  console.log("  npm run model:birefnet:install");
  console.log("");
  console.log("Install from local file or URL:");
  console.log("  npm run model:birefnet:install -- --source C:\\path\\to\\birefnet.onnx");
  console.log("  npm run model:birefnet:install -- --source https://example.com/birefnet.onnx");
  console.log("");
  console.log("Optional integrity check:");
  console.log("  --sha256 <expected sha256>");
}

async function installModel(source) {
  fs.mkdirSync(maskingDir, { recursive: true });
  const destination = targetPathForSource(source);
  if (/^https?:\/\//i.test(source)) {
    await download(source, destination);
    return;
  }

  const sourcePath = path.resolve(source);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`BiRefNet source model not found: ${sourcePath}`);
  }

  fs.copyFileSync(sourcePath, destination);
}

function targetPathForSource(source) {
  const normalized = source.toLowerCase().split("?")[0];
  if (normalized.endsWith(".tflite")) {
    return tfliteTargetPath;
  }
  return onnxTargetPath;
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}

function validateInstalledModel(expectedSha256) {
  const onnxValidation = validateOnnxModel(onnxTargetPath, expectedSha256);
  if (onnxValidation.ok) {
    return onnxValidation;
  }

  const tfliteValidation = validateTfliteModel(tfliteTargetPath, expectedSha256);
  if (tfliteValidation.ok) {
    return tfliteValidation;
  }

  return {
    ok: false,
    message:
      "BiRefNet model is missing. Add the model at assets/models/masking/birefnet.onnx."
  };
}

function validateOnnxModel(filePath, expectedSha256) {
  if (!fs.existsSync(filePath)) {
    return { ok: false };
  }

  const stats = fs.statSync(filePath);
  if (stats.size < 1024 * 1024) {
    return {
      ok: false,
      message: `BiRefNet ONNX model is too small to be real: ${stats.size} bytes.`
    };
  }

  return validateHash(filePath, expectedSha256, {
    format: "onnx",
    path: filePath,
    size: stats.size
  });
}

function validateTfliteModel(filePath, expectedSha256) {
  if (!fs.existsSync(filePath)) {
    return { ok: false };
  }

  const stats = fs.statSync(filePath);
  if (stats.size < 1024) {
    return {
      ok: false,
      message: `BiRefNet TFLite model is too small to be real: ${stats.size} bytes.`
    };
  }

  const header = Buffer.alloc(8);
  const descriptor = fs.openSync(filePath, "r");
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }

  const identifier = header.subarray(4, 8).toString("ascii");
  if (identifier !== "TFL3") {
    return {
      ok: false,
      message:
        "BiRefNet TFLite model exists but is not a TensorFlow Lite FlatBuffer with TFL3 identifier."
    };
  }

  return validateHash(filePath, expectedSha256, {
    format: "tflite",
    path: filePath,
    size: stats.size
  });
}

function validateHash(filePath, expectedSha256, baseResult) {
  const sha256 = sha256File(filePath);
  if (expectedSha256 && sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    return {
      ok: false,
      message: `BiRefNet model SHA256 mismatch. Expected ${expectedSha256}, got ${sha256}.`
    };
  }

  return {
    ok: true,
    ...baseResult,
    sha256
  };
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
