package com.forgescan.nativeengines;

import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Collections;
import java.util.Map;
import ai.onnxruntime.NodeInfo;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import ai.onnxruntime.TensorInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import org.tensorflow.lite.DataType;
import org.tensorflow.lite.Interpreter;
import org.tensorflow.lite.Tensor;

@ReactModule(name = ForgeScanNativeMaskingModule.NAME)
public class ForgeScanNativeMaskingModule extends ReactContextBaseJavaModule {
  public static final String NAME = "ForgeScanNativeMasking";
  private static final String ENGINE_VERSION = "0.4.0";
  private static final String BIREFNET_ONNX_ASSET = "models/masking/birefnet.onnx";
  private static final String BIREFNET_TFLITE_ASSET = "models/masking/birefnet.tflite";
  private static final String TEMP_SEGMENTATION_ASSET = "models/masking/mobile-segmentation.tflite";
  private static final String BIREFNET_MISSING_MESSAGE =
    "BiRefNet model is missing. Add the model at assets/models/masking/birefnet.onnx.";
  private static final float[] IMAGENET_MEAN = { 0.485f, 0.456f, 0.406f };
  private static final float[] IMAGENET_STD = { 0.229f, 0.224f, 0.225f };
  private volatile boolean cancelled = false;

  public ForgeScanNativeMaskingModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void getAvailability(Promise promise) {
    try {
      ModelAsset model = findModelAsset();
      ModelLoadStatus modelStatus = getModelLoadStatus(model);
      JSONObject result = new JSONObject();
      boolean birefnetPresent = biRefNetAssetExists();
      boolean temporaryDeepLabPresent = assetExists(TEMP_SEGMENTATION_ASSET);
      result.put("available", true);
      result.put("mode", "native-ai");
      result.put("moduleName", NAME);
      result.put("engineName", modelStatus.engineName);
      result.put("engineVersion", ENGINE_VERSION);
      result.put("modelExists", model != null);
      result.put("birefnetModelPresent", birefnetPresent);
      result.put("temporaryDeepLabModelPresent", temporaryDeepLabPresent);
      result.put("modelLoaded", modelStatus.modelLoaded);
      result.put("inferenceRan", false);
      result.put("maskPngWritten", false);
      result.put("modelName", modelStatus.modelName);
      result.put("modelAssetPath", model == null ? "" : model.assetPath);
      result.put("modelStatus", modelStatus.status);
      result.put("birefnetLoaded", modelStatus.modelLoaded && modelStatus.isBiRefNet);
      result.put("birefnetInferencePassed", false);
      result.put("inferenceBackend", modelStatus.inferenceBackend);
      result.put("fallbackUsed", !modelStatus.isBiRefNet);
      result.put("activeMaskingEngine", modelStatus.engineName);
      result.put("maskingEngineStatus", maskingEngineStatus(modelStatus));
      result.put("warnings", modelStatus.warnings);
      result.put("errors", modelStatus.errors);
      if (!modelStatus.reason.isEmpty()) {
        result.put("reason", modelStatus.reason);
      }
      promise.resolve(result.toString());
    } catch (Exception error) {
      promise.reject("FORGESCAN_MASKING_AVAILABILITY_FAILED", error);
    }
  }

  @ReactMethod
  public void runMasking(String inputJson, Promise promise) {
    cancelled = false;
    try {
      JSONObject input = new JSONObject(inputJson);
      JSONArray frames = input.getJSONArray("frames");
      JSONArray artifacts = new JSONArray();
      JSONArray warnings = new JSONArray();
      JSONArray errors = new JSONArray();
      ModelAsset model = findModelAsset();
      ModelLoadStatus modelStatus = getModelLoadStatus(model);
      MaskingSession session = createMaskingSession(model, modelStatus, warnings, errors);

      try {
        for (int index = 0; index < frames.length(); index += 1) {
          if (cancelled) {
            throw new IOException("Native masking was cancelled.");
          }

          JSONObject frame = frames.getJSONObject(index);
          try {
            JSONObject artifact = runMaskForFrame(input, frame, session);
            appendAll(warnings, artifact.getJSONArray("warnings"));
            appendAll(errors, artifact.getJSONArray("errors"));
            artifacts.put(artifact);
          } catch (Exception frameError) {
            JSONObject failed = baseArtifact(frame);
            failed.put("status", "failed");
            failed.getJSONArray("errors").put(frameError.getMessage());
            artifacts.put(failed);
            errors.put(frameError.getMessage());
          }
        }
      } finally {
        session.close();
      }

      JSONObject result = new JSONObject();
      result.put("status", errors.length() == 0 ? "complete" : "failed");
      result.put("maskArtifacts", artifacts);
      result.put("engineName", session.engineName);
      result.put("engineVersion", ENGINE_VERSION);
      result.put("modelName", session.modelName);
      result.put("modelExists", model != null);
      result.put("birefnetModelPresent", biRefNetAssetExists());
      result.put("temporaryDeepLabModelPresent", assetExists(TEMP_SEGMENTATION_ASSET));
      result.put("modelLoaded", session.modelLoaded);
      result.put("inferenceRan", session.inferenceRan);
      result.put("maskPngWritten", session.maskPngWritten);
      result.put("modelStatus", session.modelStatus);
      result.put("birefnetLoaded", session.modelLoaded && session.isBiRefNet);
      result.put("birefnetInferencePassed", session.isBiRefNet && session.inferenceRan);
      result.put("inferenceBackend", session.inferenceBackend);
      result.put("fallbackUsed", session.fallbackUsed);
      result.put("activeMaskingEngine", session.engineName);
      result.put("maskingEngineStatus", maskingEngineStatus(session));
      result.put("warnings", warnings);
      result.put("errors", errors);
      promise.resolve(result.toString());
    } catch (Exception error) {
      promise.reject("FORGESCAN_MASKING_FAILED", error);
    }
  }

  @ReactMethod
  public void runOneFrameMaskTest(Promise promise) {
    runOneFrameMaskSmoke(false, promise);
  }

  @ReactMethod
  public void runOneFrameBiRefNetMaskTest(Promise promise) {
    runOneFrameMaskSmoke(true, promise);
  }

  private void runOneFrameMaskSmoke(boolean requireBiRefNet, Promise promise) {
    cancelled = false;
    try {
      File root = new File(getReactApplicationContext().getCacheDir(), "forgescan-smoke/masking");
      File source = new File(root, "source.png");
      ForgeScanNativeFiles.ensureParent(source);
      writeSmokeSource(source);

      JSONObject input = new JSONObject();
      input.put("projectId", "mask-smoke");
      input.put("outputDirectory", "advanced/masks");
      JSONArray frames = new JSONArray();
      JSONObject frame = new JSONObject();
      frame.put("rotationId", "upright");
      frame.put("frameIndex", 1);
      frame.put("frameUri", ForgeScanNativeFiles.fileUri(source));
      frames.put(frame);
      input.put("frames", frames);

      JSONArray warnings = new JSONArray();
      JSONArray errors = new JSONArray();
      ModelAsset model = requireBiRefNet ? findBiRefNetModelAsset() : findModelAsset();
      ModelLoadStatus modelStatus = getModelLoadStatus(model);
      if (requireBiRefNet && (model == null || !modelStatus.modelLoaded || !modelStatus.isBiRefNet)) {
        JSONObject result = new JSONObject();
        result.put("status", "fail");
        result.put("maskBytes", 0);
        result.put("modelExists", model != null);
        result.put("birefnetModelPresent", biRefNetAssetExists());
        result.put("temporaryDeepLabModelPresent", assetExists(TEMP_SEGMENTATION_ASSET));
        result.put("modelLoaded", false);
        result.put("inferenceRan", false);
        result.put("maskPngWritten", false);
        result.put("modelStatus", model == null ? "missing" : "load-failed");
        result.put("modelName", "birefnet.onnx");
        result.put("modelAssetPath", BIREFNET_ONNX_ASSET);
        result.put("engineName", "BiRefNet Android");
        result.put("activeMaskingEngine", "BiRefNet Android");
        result.put("maskingEngineStatus", model == null ? "birefnet-model-missing" : "birefnet-load-failed");
        result.put("birefnetLoaded", false);
        result.put("birefnetInferencePassed", false);
        result.put("inferenceBackend", "onnxruntime");
        result.put("fallbackUsed", false);
        if (model == null) {
          warnings.put(BIREFNET_MISSING_MESSAGE);
        } else {
          appendAll(errors, modelStatus.errors);
        }
        result.put("warnings", warnings);
        result.put("errors", errors);
        promise.resolve(result.toString());
        return;
      }
      MaskingSession session = createMaskingSession(model, modelStatus, warnings, errors);
      JSONObject artifact;
      try {
        artifact = runMaskForFrame(input, frame, session);
      } finally {
        session.close();
      }
      File refined = ForgeScanNativeFiles.fileFromUri(artifact.getString("refinedMaskUri"));

      JSONObject result = new JSONObject();
      result.put(
        "status",
        session.inferenceRan && refined.exists() && refined.length() > 0 ? "pass" : "fail"
      );
      result.put("maskUri", ForgeScanNativeFiles.fileUri(refined));
      result.put("maskBytes", refined.length());
      result.put("modelExists", model != null);
      result.put("birefnetModelPresent", biRefNetAssetExists());
      result.put("temporaryDeepLabModelPresent", assetExists(TEMP_SEGMENTATION_ASSET));
      result.put("modelLoaded", session.modelLoaded);
      result.put("inferenceRan", session.inferenceRan);
      result.put("maskPngWritten", session.maskPngWritten);
      result.put("modelStatus", session.modelStatus);
      result.put("modelName", session.modelName);
      result.put("modelAssetPath", model == null ? "" : model.assetPath);
      result.put("engineName", session.engineName);
      result.put("activeMaskingEngine", session.engineName);
      result.put("maskingEngineStatus", maskingEngineStatus(session));
      result.put("birefnetLoaded", session.modelLoaded && session.isBiRefNet);
      result.put("birefnetInferencePassed", session.isBiRefNet && session.inferenceRan);
      result.put("inferenceBackend", session.inferenceBackend);
      result.put("fallbackUsed", session.fallbackUsed);
      result.put("warnings", warnings);
      result.put("errors", errors);
      promise.resolve(result.toString());
    } catch (Exception error) {
      promise.reject("FORGESCAN_MASKING_SMOKE_FAILED", error);
    }
  }

  @ReactMethod
  public void cancelMasking(Promise promise) {
    cancelled = true;
    promise.resolve(null);
  }

  private JSONObject runMaskForFrame(
    JSONObject input,
    JSONObject frame,
    MaskingSession session
  ) throws Exception {
    String rotationId = frame.getString("rotationId");
    int frameIndex = frame.getInt("frameIndex");
    String sourceFrameUri = frame.getString("frameUri");
    File source = ForgeScanNativeFiles.fileFromUri(sourceFrameUri);
    Bitmap bitmap = BitmapFactory.decodeFile(source.getAbsolutePath());

    if (bitmap == null) {
      throw new IOException("Unable to decode source frame: " + sourceFrameUri);
    }

    Bitmap rawMask = session.createMask(bitmap);
    Bitmap refinedMask = refineMask(rawMask);
    String frameName = "frame_" + String.format("%03d", frameIndex) + ".png";
    File rawFile = ForgeScanNativeFiles.resolveProjectFile(
      getReactApplicationContext(),
      input,
      "advanced/masks/raw/" + rotationId + "/" + frameName
    );
    File refinedFile = ForgeScanNativeFiles.resolveProjectFile(
      getReactApplicationContext(),
      input,
      "advanced/masks/refined/" + rotationId + "/" + frameName
    );

    writePng(rawMask, rawFile);
    writePng(refinedMask, refinedFile);
    session.maskPngWritten = rawFile.exists() && rawFile.length() > 0 && refinedFile.exists() && refinedFile.length() > 0;

    JSONObject artifact = baseArtifact(frame);
    artifact.put("sourceFrameUri", sourceFrameUri);
    artifact.put("rawMaskPath", "advanced/masks/raw/" + rotationId + "/" + frameName);
    artifact.put("refinedMaskPath", "advanced/masks/refined/" + rotationId + "/" + frameName);
    artifact.put("rawMaskUri", ForgeScanNativeFiles.fileUri(rawFile));
    artifact.put("refinedMaskUri", ForgeScanNativeFiles.fileUri(refinedFile));
    artifact.put("status", "complete");
    artifact.put("engineName", session.engineName);
    artifact.put("modelName", session.modelName);
    artifact.put("modelLoaded", session.modelLoaded);
    artifact.put("inferenceRan", session.inferenceRan);
    artifact.put("maskPngWritten", session.maskPngWritten);
    if (!session.warningMessage.isEmpty()) {
      artifact.getJSONArray("warnings").put(session.warningMessage);
    }
    artifact.put("maskFileBytes", refinedFile.length());
    if (session.modelLoaded && !session.inferenceRan) {
      artifact.getJSONArray("warnings").put("On-phone masking inference failed. Fallback-local mask was used.");
      if (!session.lastInferenceError.isEmpty()) {
        artifact.getJSONArray("errors").put(session.lastInferenceError);
      }
    }
    return artifact;
  }

  private JSONObject baseArtifact(JSONObject frame) throws Exception {
    int frameIndex = frame.getInt("frameIndex");
    String rotationId = frame.getString("rotationId");
    String frameName = "frame_" + String.format("%03d", frameIndex) + ".png";
    JSONObject artifact = new JSONObject();
    artifact.put("rotationId", rotationId);
    artifact.put("frameIndex", frameIndex);
    artifact.put("sourceFrameUri", frame.optString("frameUri"));
    artifact.put("rawMaskPath", "advanced/masks/raw/" + rotationId + "/" + frameName);
    artifact.put("refinedMaskPath", "advanced/masks/refined/" + rotationId + "/" + frameName);
    artifact.put("warnings", new JSONArray());
    artifact.put("errors", new JSONArray());
    return artifact;
  }

  private Bitmap createFallbackMask(Bitmap source) {
    int width = source.getWidth();
    int height = source.getHeight();
    Bitmap mask = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
    int background = estimateBackgroundColor(source);
    int center = source.getPixel(width / 2, height / 2);
    int[] raw = new int[width * height];

    for (int y = 0; y < height; y += 1) {
      for (int x = 0; x < width; x += 1) {
        int color = source.getPixel(x, y);
        double bgDistance = colorDistance(color, background);
        double centerDistance = colorDistance(color, center);
        double nx = (x - width * 0.5) / Math.max(1.0, width * 0.5);
        double ny = (y - height * 0.5) / Math.max(1.0, height * 0.5);
        double centerPrior = Math.max(0.0, 1.0 - Math.sqrt(nx * nx + ny * ny));
        boolean foreground = bgDistance > 34.0 || (centerPrior > 0.48 && centerDistance < 92.0);
        raw[y * width + x] = foreground ? Color.WHITE : Color.TRANSPARENT;
      }
    }

    mask.setPixels(raw, 0, width, 0, 0, width, height);
    return mask;
  }

  private Bitmap createTfliteMask(Bitmap source, Interpreter interpreter) {
    Tensor inputTensor = interpreter.getInputTensor(0);
    Tensor outputTensor = interpreter.getOutputTensor(0);
    int[] inputShape = inputTensor.shape();
    int inputHeight = inputShape.length >= 3 ? inputShape[inputShape.length - 3] : 257;
    int inputWidth = inputShape.length >= 3 ? inputShape[inputShape.length - 2] : 257;
    int inputChannels = inputShape.length >= 1 ? inputShape[inputShape.length - 1] : 3;
    ByteBuffer inputBuffer = createInputBuffer(source, inputTensor.dataType(), inputWidth, inputHeight, inputChannels);
    int[] outputShape = outputTensor.shape();
    DataType outputType = outputTensor.dataType();
    ByteBuffer outputBuffer = ByteBuffer
      .allocateDirect(outputElementCount(outputShape) * bytesPerElement(outputType))
      .order(ByteOrder.nativeOrder());

    interpreter.run(inputBuffer, outputBuffer);
    outputBuffer.rewind();
    return maskFromOutput(outputBuffer, outputType, outputShape, source.getWidth(), source.getHeight());
  }

  private Bitmap createOnnxMask(
    Bitmap source,
    OrtEnvironment environment,
    OrtSession session
  ) throws Exception {
    Map.Entry<String, NodeInfo> inputEntry = session.getInputInfo().entrySet().iterator().next();
    TensorInfo inputInfo = (TensorInfo) inputEntry.getValue().getInfo();
    OnnxInputLayout inputLayout = OnnxInputLayout.fromShape(inputInfo.getShape());
    float[] inputData = createOnnxInput(source, inputLayout);
    OnnxTensor inputTensor = OnnxTensor.createTensor(
      environment,
      FloatBuffer.wrap(inputData),
      inputLayout.shape
    );

    OrtSession.Result result = null;
    try {
      result = session.run(Collections.singletonMap(inputEntry.getKey(), inputTensor));
      OnnxTensor outputTensor = null;

      for (Map.Entry<String, OnnxValue> output : result) {
        if (output.getValue() instanceof OnnxTensor) {
          outputTensor = (OnnxTensor) output.getValue();
        }
      }

      if (outputTensor == null) {
        throw new IOException("BiRefNet ONNX did not return a tensor output.");
      }

      TensorInfo outputInfo = (TensorInfo) outputTensor.getInfo();
      FloatBuffer outputBuffer = outputTensor.getFloatBuffer();
      outputBuffer.rewind();
      return maskFromFloatOutput(
        outputBuffer,
        outputInfo.getShape(),
        source.getWidth(),
        source.getHeight()
      );
    } finally {
      inputTensor.close();
      if (result != null) {
        result.close();
      }
    }
  }

  private float[] createOnnxInput(Bitmap source, OnnxInputLayout layout) {
    Bitmap scaled = Bitmap.createScaledBitmap(source, layout.width, layout.height, true);
    float[] data = new float[(int) elementCount(layout.shape)];

    for (int y = 0; y < layout.height; y += 1) {
      for (int x = 0; x < layout.width; x += 1) {
        int color = scaled.getPixel(x, y);
        float[] channels = {
          normalizeInput(Color.red(color), 0),
          normalizeInput(Color.green(color), 1),
          normalizeInput(Color.blue(color), 2)
        };
        for (int channel = 0; channel < layout.channels; channel += 1) {
          int sourceChannel = Math.min(2, channel);
          data[layout.index(x, y, channel)] = channels[sourceChannel];
        }
      }
    }

    return data;
  }

  private float normalizeInput(int value, int channel) {
    float scaled = value / 255.0f;
    return (scaled - IMAGENET_MEAN[channel]) / IMAGENET_STD[channel];
  }

  private Bitmap maskFromFloatOutput(
    FloatBuffer output,
    long[] shape,
    int targetWidth,
    int targetHeight
  ) {
    OutputLayout layout = OutputLayout.fromOnnxShape(shape);
    Bitmap mask = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
    int[] pixels = new int[targetWidth * targetHeight];

    for (int y = 0; y < targetHeight; y += 1) {
      int oy = Math.min(layout.height - 1, Math.max(0, Math.round((y / (float) Math.max(1, targetHeight - 1)) * (layout.height - 1))));
      for (int x = 0; x < targetWidth; x += 1) {
        int ox = Math.min(layout.width - 1, Math.max(0, Math.round((x / (float) Math.max(1, targetWidth - 1)) * (layout.width - 1))));
        boolean foreground = isFloatOutputForeground(output, layout, ox, oy);
        pixels[y * targetWidth + x] = foreground ? Color.WHITE : Color.TRANSPARENT;
      }
    }

    mask.setPixels(pixels, 0, targetWidth, 0, 0, targetWidth, targetHeight);
    return mask;
  }

  private boolean isFloatOutputForeground(
    FloatBuffer output,
    OutputLayout layout,
    int x,
    int y
  ) {
    if (layout.channels <= 1) {
      return sigmoidIfNeeded(output.get(layout.index(x, y, 0))) > 0.5f;
    }

    int bestClass = 0;
    float bestValue = -Float.MAX_VALUE;
    for (int channel = 0; channel < layout.channels; channel += 1) {
      float value = output.get(layout.index(x, y, channel));
      if (value > bestValue) {
        bestValue = value;
        bestClass = channel;
      }
    }

    return bestClass != 0;
  }

  private float sigmoidIfNeeded(float value) {
    if (value >= 0.0f && value <= 1.0f) {
      return value;
    }
    return (float) (1.0 / (1.0 + Math.exp(-value)));
  }

  private ByteBuffer createInputBuffer(
    Bitmap source,
    DataType dataType,
    int inputWidth,
    int inputHeight,
    int inputChannels
  ) {
    Bitmap scaled = Bitmap.createScaledBitmap(source, inputWidth, inputHeight, true);
    ByteBuffer buffer = ByteBuffer
      .allocateDirect(inputWidth * inputHeight * Math.max(1, inputChannels) * bytesPerElement(dataType))
      .order(ByteOrder.nativeOrder());

    for (int y = 0; y < inputHeight; y += 1) {
      for (int x = 0; x < inputWidth; x += 1) {
        int color = scaled.getPixel(x, y);
        putInputValue(buffer, dataType, Color.red(color));
        if (inputChannels > 1) {
          putInputValue(buffer, dataType, Color.green(color));
        }
        if (inputChannels > 2) {
          putInputValue(buffer, dataType, Color.blue(color));
        }
        for (int channel = 3; channel < inputChannels; channel += 1) {
          putInputValue(buffer, dataType, 0);
        }
      }
    }

    buffer.rewind();
    return buffer;
  }

  private void putInputValue(ByteBuffer buffer, DataType dataType, int value) {
    if (dataType == DataType.FLOAT32) {
      buffer.putFloat(value / 255.0f);
    } else if (dataType == DataType.UINT8) {
      buffer.put((byte) value);
    } else if (dataType == DataType.INT32) {
      buffer.putInt(value);
    } else {
      buffer.put((byte) value);
    }
  }

  private Bitmap maskFromOutput(
    ByteBuffer output,
    DataType dataType,
    int[] shape,
    int targetWidth,
    int targetHeight
  ) {
    OutputLayout layout = OutputLayout.fromShape(shape);
    Bitmap mask = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
    int[] pixels = new int[targetWidth * targetHeight];

    for (int y = 0; y < targetHeight; y += 1) {
      int oy = Math.min(layout.height - 1, Math.max(0, Math.round((y / (float) Math.max(1, targetHeight - 1)) * (layout.height - 1))));
      for (int x = 0; x < targetWidth; x += 1) {
        int ox = Math.min(layout.width - 1, Math.max(0, Math.round((x / (float) Math.max(1, targetWidth - 1)) * (layout.width - 1))));
        boolean foreground = isOutputForeground(output, dataType, layout, ox, oy);
        pixels[y * targetWidth + x] = foreground ? Color.WHITE : Color.TRANSPARENT;
      }
    }

    mask.setPixels(pixels, 0, targetWidth, 0, 0, targetWidth, targetHeight);
    return mask;
  }

  private boolean isOutputForeground(
    ByteBuffer output,
    DataType dataType,
    OutputLayout layout,
    int x,
    int y
  ) {
    if (layout.channels <= 1) {
      float value = readOutputValue(output, dataType, layout.index(x, y, 0));
      return dataType == DataType.FLOAT32 ? value > 0.5f : value > 0.0f;
    }

    int bestClass = 0;
    float bestValue = -Float.MAX_VALUE;
    for (int channel = 0; channel < layout.channels; channel += 1) {
      float value = readOutputValue(output, dataType, layout.index(x, y, channel));
      if (value > bestValue) {
        bestValue = value;
        bestClass = channel;
      }
    }

    return bestClass != 0;
  }

  private float readOutputValue(ByteBuffer buffer, DataType dataType, int index) {
    if (dataType == DataType.FLOAT32) {
      return buffer.getFloat(index * 4);
    }
    if (dataType == DataType.UINT8) {
      return buffer.get(index) & 0xff;
    }
    if (dataType == DataType.INT32) {
      return buffer.getInt(index * 4);
    }
    return buffer.get(index) & 0xff;
  }

  private Bitmap refineMask(Bitmap rawMask) {
    int width = rawMask.getWidth();
    int height = rawMask.getHeight();
    int[] raw = new int[width * height];
    rawMask.getPixels(raw, 0, width, 0, 0, width, height);
    int[] refined = majorityFilter(raw, width, height);
    Bitmap mask = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
    mask.setPixels(refined, 0, width, 0, 0, width, height);
    return mask;
  }

  private int[] majorityFilter(int[] pixels, int width, int height) {
    int[] out = new int[pixels.length];
    for (int y = 0; y < height; y += 1) {
      for (int x = 0; x < width; x += 1) {
        int count = 0;
        for (int yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
          for (int xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
            if (Color.alpha(pixels[yy * width + xx]) > 0) {
              count += 1;
            }
          }
        }
        out[y * width + x] = count >= 4 ? Color.WHITE : Color.TRANSPARENT;
      }
    }
    return out;
  }

  private int estimateBackgroundColor(Bitmap bitmap) {
    long red = 0;
    long green = 0;
    long blue = 0;
    int count = 0;
    int width = bitmap.getWidth();
    int height = bitmap.getHeight();
    int step = Math.max(1, Math.min(width, height) / 48);

    for (int x = 0; x < width; x += step) {
      int top = bitmap.getPixel(x, 0);
      int bottom = bitmap.getPixel(x, height - 1);
      red += Color.red(top) + Color.red(bottom);
      green += Color.green(top) + Color.green(bottom);
      blue += Color.blue(top) + Color.blue(bottom);
      count += 2;
    }

    for (int y = 0; y < height; y += step) {
      int left = bitmap.getPixel(0, y);
      int right = bitmap.getPixel(width - 1, y);
      red += Color.red(left) + Color.red(right);
      green += Color.green(left) + Color.green(right);
      blue += Color.blue(left) + Color.blue(right);
      count += 2;
    }

    return Color.rgb((int) (red / count), (int) (green / count), (int) (blue / count));
  }

  private double colorDistance(int a, int b) {
    int dr = Color.red(a) - Color.red(b);
    int dg = Color.green(a) - Color.green(b);
    int db = Color.blue(a) - Color.blue(b);
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  private void writePng(Bitmap bitmap, File file) throws IOException {
    ForgeScanNativeFiles.ensureParent(file);
    FileOutputStream stream = new FileOutputStream(file);
    try {
      if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
        throw new IOException("Unable to write PNG mask: " + file.getAbsolutePath());
      }
    } finally {
      stream.close();
    }
  }

  private void writeSmokeSource(File file) throws IOException {
    Bitmap bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(bitmap);
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setColor(Color.rgb(28, 84, 88));
    canvas.drawRect(0, 0, 96, 96, paint);
    paint.setColor(Color.rgb(230, 190, 118));
    canvas.drawCircle(48, 48, 28, paint);
    writePng(bitmap, file);
  }

  private ModelAsset findModelAsset() {
    ModelAsset birefnet = findBiRefNetModelAsset();
    if (birefnet != null) {
      return birefnet;
    }
    if (assetExists(TEMP_SEGMENTATION_ASSET)) {
      return new ModelAsset(
        TEMP_SEGMENTATION_ASSET,
        "Temporary DeepLab Android",
        "mobile-segmentation.tflite",
        "Temporary DeepLab segmentation model loaded.",
        false,
        "tflite"
      );
    }
    return null;
  }

  private ModelAsset findBiRefNetModelAsset() {
    if (assetExists(BIREFNET_ONNX_ASSET)) {
      return new ModelAsset(
        BIREFNET_ONNX_ASSET,
        "BiRefNet Android ONNX",
        "birefnet.onnx",
        "BiRefNet Android ONNX model loaded.",
        true,
        "onnxruntime"
      );
    }
    if (assetExists(BIREFNET_TFLITE_ASSET)) {
      return new ModelAsset(
        BIREFNET_TFLITE_ASSET,
        "BiRefNet Android",
        "birefnet.tflite",
        "BiRefNet Android model loaded.",
        true,
        "tflite"
      );
    }
    return null;
  }

  private boolean biRefNetAssetExists() {
    return assetExists(BIREFNET_ONNX_ASSET) || assetExists(BIREFNET_TFLITE_ASSET);
  }

  private boolean assetExists(String assetPath) {
    AssetManager assets = getReactApplicationContext().getAssets();
    try {
      assets.open(assetPath).close();
      return true;
    } catch (Exception ignored) {
      return false;
    }
  }

  private ModelLoadStatus getModelLoadStatus(ModelAsset model) {
    JSONArray warnings = new JSONArray();
    JSONArray errors = new JSONArray();
    if (model == null) {
      warnings.put(BIREFNET_MISSING_MESSAGE);
      warnings.put("Fallback local object preparation used. This is not production object-background removal.");
      return new ModelLoadStatus(
        "fallback-local",
        "fallback-local",
        "missing",
        false,
        BIREFNET_MISSING_MESSAGE,
        false,
        "none",
        warnings,
        errors
      );
    }

    try {
      if ("onnxruntime".equals(model.inferenceBackend)) {
        OrtEnvironment environment = OrtEnvironment.getEnvironment();
        OrtSession session = environment.createSession(loadModelBytes(model.assetPath), new OrtSession.SessionOptions());
        session.close();
      } else {
        Interpreter interpreter = new Interpreter(loadModelBuffer(model.assetPath));
        interpreter.close();
      }

      warnings.put(model.loadedMessage);
      if (!model.isBiRefNet) {
        warnings.put("Temporary DeepLab segmentation used. Object isolation may be imperfect.");
      }
      return new ModelLoadStatus(
        model.engineName,
        model.modelName,
        "loaded",
        true,
        "",
        model.isBiRefNet,
        model.inferenceBackend,
        warnings,
        errors
      );
    } catch (Exception error) {
      errors.put("On-phone masking model failed to load.");
      errors.put(error.getMessage());
      return new ModelLoadStatus(
        "fallback-local",
        model.modelName,
        "load-failed",
        false,
        "On-phone masking model failed to load.",
        model.isBiRefNet,
        model.inferenceBackend,
        warnings,
        errors
      );
    }
  }

  private MaskingSession createMaskingSession(
    ModelAsset model,
    ModelLoadStatus modelStatus,
    JSONArray warnings,
    JSONArray errors
  ) {
    appendAll(warnings, modelStatus.warnings);
    appendAll(errors, modelStatus.errors);

    if (model == null || !modelStatus.modelLoaded) {
      return new MaskingSession(
        null,
        null,
        null,
        "fallback-local",
        modelStatus.modelName,
        false,
        modelStatus.status,
        modelStatus.reason,
        modelStatus.isBiRefNet,
        modelStatus.inferenceBackend,
        true
      );
    }

    try {
      if ("onnxruntime".equals(model.inferenceBackend)) {
        OrtEnvironment environment = OrtEnvironment.getEnvironment();
        OrtSession session = environment.createSession(loadModelBytes(model.assetPath), new OrtSession.SessionOptions());
        return new MaskingSession(
          null,
          environment,
          session,
          model.engineName,
          model.modelName,
          modelStatus.modelLoaded,
          modelStatus.status,
          "",
          model.isBiRefNet,
          model.inferenceBackend,
          false
        );
      }

      Interpreter interpreter = new Interpreter(loadModelBuffer(model.assetPath));
      return new MaskingSession(
        interpreter,
        null,
        null,
        model.engineName,
        model.modelName,
        modelStatus.modelLoaded,
        modelStatus.status,
        model.isBiRefNet
          ? ""
          : "Temporary DeepLab segmentation used. Object isolation may be imperfect.",
        model.isBiRefNet,
        model.inferenceBackend,
        !model.isBiRefNet
      );
    } catch (Exception error) {
      warnings.put("Fallback-local masking used after native model session failed.");
      errors.put("On-phone masking model failed to load.");
      errors.put(error.getMessage());
      return new MaskingSession(
        null,
        null,
        null,
        "fallback-local",
        model.modelName,
        false,
        "load-failed",
        "On-phone masking model failed to load.",
        model.isBiRefNet,
        model.inferenceBackend,
        true
      );
    }
  }

  private ByteBuffer loadModelBuffer(String assetPath) throws IOException {
    byte[] bytes = loadModelBytes(assetPath);
    ByteBuffer buffer = ByteBuffer.allocateDirect(bytes.length).order(ByteOrder.nativeOrder());
    buffer.put(bytes);
    buffer.rewind();
    return buffer;
  }

  private byte[] loadModelBytes(String assetPath) throws IOException {
    InputStream stream = getReactApplicationContext().getAssets().open(assetPath);
    try {
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      byte[] chunk = new byte[16384];
      int read;
      while ((read = stream.read(chunk)) != -1) {
        output.write(chunk, 0, read);
      }
      return output.toByteArray();
    } finally {
      stream.close();
    }
  }

  private int outputElementCount(int[] shape) {
    int count = 1;
    for (int value : shape) {
      count *= Math.max(1, value);
    }
    return count;
  }

  private long elementCount(long[] shape) {
    long count = 1;
    for (long value : shape) {
      count *= Math.max(1, value);
    }
    return count;
  }

  private int bytesPerElement(DataType dataType) {
    if (dataType == DataType.FLOAT32 || dataType == DataType.INT32) {
      return 4;
    }
    return 1;
  }

  private void appendAll(JSONArray destination, JSONArray source) {
    for (int index = 0; index < source.length(); index += 1) {
      destination.put(source.opt(index));
    }
  }

  private String maskingEngineStatus(ModelLoadStatus status) {
    if (!status.modelLoaded && "missing".equals(status.status)) {
      return "birefnet-model-missing";
    }
    if (!status.modelLoaded && status.isBiRefNet) {
      return "birefnet-load-failed";
    }
    if (!status.modelLoaded) {
      return "fallback-local";
    }
    if (status.isBiRefNet) {
      return "birefnet-running";
    }
    if ("mobile-segmentation.tflite".equals(status.modelName)) {
      return "temporary-deeplab-fallback";
    }
    return "failed";
  }

  private String maskingEngineStatus(MaskingSession session) {
    if (!session.modelLoaded && "missing".equals(session.modelStatus)) {
      return "birefnet-model-missing";
    }
    if (!session.modelLoaded && session.isBiRefNet) {
      return "birefnet-load-failed";
    }
    if (!session.modelLoaded || "fallback-local".equals(session.engineName)) {
      return "fallback-local";
    }
    if (session.isBiRefNet) {
      return session.inferenceRan ? "birefnet-complete" : "birefnet-running";
    }
    if ("mobile-segmentation.tflite".equals(session.modelName)) {
      return "temporary-deeplab-fallback";
    }
    return "failed";
  }

  private static class ModelAsset {
    final String assetPath;
    final String engineName;
    final String modelName;
    final String loadedMessage;
    final boolean isBiRefNet;
    final String inferenceBackend;

    ModelAsset(
      String assetPath,
      String engineName,
      String modelName,
      String loadedMessage,
      boolean isBiRefNet,
      String inferenceBackend
    ) {
      this.assetPath = assetPath;
      this.engineName = engineName;
      this.modelName = modelName;
      this.loadedMessage = loadedMessage;
      this.isBiRefNet = isBiRefNet;
      this.inferenceBackend = inferenceBackend;
    }
  }

  private static class ModelLoadStatus {
    final String engineName;
    final String modelName;
    final String status;
    final boolean modelLoaded;
    final String reason;
    final boolean isBiRefNet;
    final String inferenceBackend;
    final JSONArray warnings;
    final JSONArray errors;

    ModelLoadStatus(
      String engineName,
      String modelName,
      String status,
      boolean modelLoaded,
      String reason,
      boolean isBiRefNet,
      String inferenceBackend,
      JSONArray warnings,
      JSONArray errors
    ) {
      this.engineName = engineName;
      this.modelName = modelName;
      this.status = status;
      this.modelLoaded = modelLoaded;
      this.reason = reason;
      this.isBiRefNet = isBiRefNet;
      this.inferenceBackend = inferenceBackend;
      this.warnings = warnings;
      this.errors = errors;
    }
  }

  private class MaskingSession {
    final Interpreter interpreter;
    final OrtEnvironment ortEnvironment;
    final OrtSession ortSession;
    final String engineName;
    final String modelName;
    final boolean modelLoaded;
    final String modelStatus;
    final String warningMessage;
    final boolean isBiRefNet;
    final String inferenceBackend;
    boolean fallbackUsed;
    boolean inferenceRan = false;
    boolean maskPngWritten = false;
    String lastInferenceError = "";

    MaskingSession(
      Interpreter interpreter,
      OrtEnvironment ortEnvironment,
      OrtSession ortSession,
      String engineName,
      String modelName,
      boolean modelLoaded,
      String modelStatus,
      String warningMessage,
      boolean isBiRefNet,
      String inferenceBackend,
      boolean fallbackUsed
    ) {
      this.interpreter = interpreter;
      this.ortEnvironment = ortEnvironment;
      this.ortSession = ortSession;
      this.engineName = engineName;
      this.modelName = modelName;
      this.modelLoaded = modelLoaded;
      this.modelStatus = modelStatus;
      this.warningMessage = warningMessage;
      this.isBiRefNet = isBiRefNet;
      this.inferenceBackend = inferenceBackend;
      this.fallbackUsed = fallbackUsed;
    }

    Bitmap createMask(Bitmap source) {
      if (interpreter == null && ortSession == null) {
        return createFallbackMask(source);
      }

      try {
        Bitmap mask = ortSession != null
          ? createOnnxMask(source, ortEnvironment, ortSession)
          : createTfliteMask(source, interpreter);
        inferenceRan = true;
        lastInferenceError = "";
        return mask;
      } catch (Exception error) {
        inferenceRan = false;
        lastInferenceError = error.getMessage();
        fallbackUsed = true;
        return createFallbackMask(source);
      }
    }

    void close() {
      if (interpreter != null) {
        interpreter.close();
      }
      if (ortSession != null) {
        try {
          ortSession.close();
        } catch (Exception ignored) {
        }
      }
    }
  }

  private static class OutputLayout {
    final int height;
    final int width;
    final int channels;
    final int baseOffset;
    final boolean nhwc;

    OutputLayout(int height, int width, int channels, int baseOffset, boolean nhwc) {
      this.height = Math.max(1, height);
      this.width = Math.max(1, width);
      this.channels = Math.max(1, channels);
      this.baseOffset = baseOffset;
      this.nhwc = nhwc;
    }

    static OutputLayout fromShape(int[] shape) {
      if (shape.length == 4) {
        return new OutputLayout(shape[1], shape[2], shape[3], 0, true);
      }
      if (shape.length == 3 && shape[0] == 1) {
        return new OutputLayout(shape[1], shape[2], 1, 0, true);
      }
      if (shape.length == 3) {
        return new OutputLayout(shape[0], shape[1], shape[2], 0, true);
      }
      if (shape.length == 2) {
        return new OutputLayout(shape[0], shape[1], 1, 0, true);
      }
      return new OutputLayout(1, Math.max(1, shape.length == 0 ? 1 : shape[0]), 1, 0, true);
    }

    static OutputLayout fromOnnxShape(long[] shape) {
      if (shape.length == 4) {
        int dim1 = safeDim(shape[1], 1);
        int dim2 = safeDim(shape[2], 1);
        int dim3 = safeDim(shape[3], 1);
        if (dim1 <= 4 && dim2 > 4 && dim3 > 4) {
          return new OutputLayout(dim2, dim3, dim1, 0, false);
        }
        return new OutputLayout(dim1, dim2, dim3, 0, true);
      }
      if (shape.length == 3) {
        int dim0 = safeDim(shape[0], 1);
        int dim1 = safeDim(shape[1], 1);
        int dim2 = safeDim(shape[2], 1);
        if (dim0 <= 4 && dim1 > 4 && dim2 > 4) {
          return new OutputLayout(dim1, dim2, dim0, 0, false);
        }
        return new OutputLayout(dim0, dim1, dim2, 0, true);
      }
      if (shape.length == 2) {
        return new OutputLayout(safeDim(shape[0], 1), safeDim(shape[1], 1), 1, 0, true);
      }
      return new OutputLayout(1, shape.length == 0 ? 1 : safeDim(shape[0], 1), 1, 0, true);
    }

    int index(int x, int y, int channel) {
      if (nhwc) {
        return baseOffset + ((y * width + x) * channels) + channel;
      }
      return baseOffset + (channel * width * height) + (y * width + x);
    }
  }

  private static int safeDim(long value, int fallback) {
    if (value <= 0 || value > Integer.MAX_VALUE) {
      return fallback;
    }
    return (int) value;
  }

  private static class OnnxInputLayout {
    final int height;
    final int width;
    final int channels;
    final boolean nhwc;
    final long[] shape;

    OnnxInputLayout(int height, int width, int channels, boolean nhwc, long[] shape) {
      this.height = Math.max(1, height);
      this.width = Math.max(1, width);
      this.channels = Math.max(1, channels);
      this.nhwc = nhwc;
      this.shape = shape;
    }

    static OnnxInputLayout fromShape(long[] sourceShape) {
      if (sourceShape.length == 4) {
        long[] shape = normalizeShape(sourceShape, new long[] { 1, 3, 1024, 1024 });
        int dim1 = safeDim(shape[1], 3);
        int dim2 = safeDim(shape[2], 1024);
        int dim3 = safeDim(shape[3], 1024);
        if (dim1 <= 4 && dim2 > 4 && dim3 > 4) {
          return new OnnxInputLayout(dim2, dim3, dim1, false, shape);
        }
        return new OnnxInputLayout(dim1, dim2, dim3, true, shape);
      }
      if (sourceShape.length == 3) {
        long[] shape = normalizeShape(sourceShape, new long[] { 3, 1024, 1024 });
        int dim0 = safeDim(shape[0], 3);
        int dim1 = safeDim(shape[1], 1024);
        int dim2 = safeDim(shape[2], 1024);
        if (dim0 <= 4 && dim1 > 4 && dim2 > 4) {
          return new OnnxInputLayout(dim1, dim2, dim0, false, shape);
        }
        return new OnnxInputLayout(dim0, dim1, dim2, true, shape);
      }
      long[] shape = new long[] { 1, 3, 1024, 1024 };
      return new OnnxInputLayout(1024, 1024, 3, false, shape);
    }

    static long[] normalizeShape(long[] sourceShape, long[] fallback) {
      long[] shape = new long[sourceShape.length];
      for (int index = 0; index < sourceShape.length; index += 1) {
        long fallbackValue = index < fallback.length ? fallback[index] : 1;
        shape[index] = sourceShape[index] > 0 ? sourceShape[index] : fallbackValue;
      }
      if (shape.length > 0) {
        shape[0] = 1;
      }
      return shape;
    }

    int index(int x, int y, int channel) {
      if (nhwc) {
        return ((y * width + x) * channels) + channel;
      }
      return (channel * width * height) + (y * width + x);
    }
  }
}
