package com.forgescan.nativeengines;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ForgeScanKsplatView extends View {
  private static final int HEADER_SIZE = 4096;
  private static final int SECTION_HEADER_SIZE = 1024;
  private static final int DATA_BASE = HEADER_SIZE + SECTION_HEADER_SIZE;
  private static final int BYTES_PER_SPLAT = 44;
  private static final int MAX_RENDERED_SPLATS = 90000;

  private final ExecutorService loader = Executors.newSingleThreadExecutor();
  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private final List<RenderSplat> renderSplats = new ArrayList<>();
  private final Object splatLock = new Object();

  private boolean autoRotate = true;
  private boolean loading = false;
  private float angle = 0f;
  private float renderScale = 1f;
  private long lastFrameMs = 0L;
  private String errorMessage = null;
  private String ksplatUri = null;

  public ForgeScanKsplatView(Context context) {
    super(context);
    setLayerType(View.LAYER_TYPE_HARDWARE, null);
    paint.setStyle(Paint.Style.FILL);
  }

  public void setAutoRotate(boolean autoRotate) {
    this.autoRotate = autoRotate;
    invalidate();
  }

  public void setKsplatUri(String ksplatUri) {
    if (ksplatUri == null || ksplatUri.equals(this.ksplatUri)) {
      return;
    }

    this.ksplatUri = ksplatUri;
    loadKsplat(ksplatUri);
  }

  public void setRenderScale(float renderScale) {
    this.renderScale = Math.max(0.4f, Math.min(2.2f, renderScale));
    invalidate();
  }

  @Override
  protected void onDetachedFromWindow() {
    super.onDetachedFromWindow();
    loader.shutdownNow();
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    canvas.drawColor(Color.rgb(13, 18, 18));

    int width = getWidth();
    int height = getHeight();
    if (width <= 0 || height <= 0) {
      return;
    }

    updateAngle();

    List<RenderSplat> localSplats;
    synchronized (splatLock) {
      localSplats = new ArrayList<>(renderSplats);
    }

    if (localSplats.isEmpty()) {
      drawCenteredText(canvas, loading ? "Loading native .ksplat preview" : getFallbackLabel());
      if (loading) {
        postInvalidateOnAnimation();
      }
      return;
    }

    final float cos = (float) Math.cos(angle);
    final float sin = (float) Math.sin(angle);
    final float centerX = width * 0.5f;
    final float centerY = height * 0.5f;
    final float viewport = Math.min(width, height) * 0.72f * renderScale;

    for (RenderSplat splat : localSplats) {
      float viewX = splat.x * cos - splat.z * sin;
      float viewZ = splat.x * sin + splat.z * cos;
      float perspective = 1.05f / Math.max(0.35f, 1.25f + viewZ * 0.35f);
      splat.screenX = centerX + viewX * perspective * viewport;
      splat.screenY = centerY - splat.y * perspective * viewport;
      splat.screenRadius = Math.max(2.4f, Math.min(42f, splat.scale * viewport * perspective * 1.65f));
      splat.viewDepth = viewZ;
    }

    Collections.sort(localSplats, Comparator.comparingDouble((RenderSplat splat) -> splat.viewDepth).reversed());

    for (RenderSplat splat : localSplats) {
      if (
        splat.screenX < -32f ||
        splat.screenY < -32f ||
        splat.screenX > width + 32f ||
        splat.screenY > height + 32f
      ) {
        continue;
      }

      int softAlpha = Math.max(18, Math.min(118, Math.round(splat.a * 0.46f)));
      paint.setColor(Color.argb(
        softAlpha,
        shadeChannel(splat.r, splat.viewDepth, 0.9f),
        shadeChannel(splat.g, splat.viewDepth, 0.9f),
        shadeChannel(splat.b, splat.viewDepth, 0.9f)
      ));
      canvas.drawCircle(splat.screenX, splat.screenY, splat.screenRadius * 3.6f, paint);
    }

    for (RenderSplat splat : localSplats) {
      if (
        splat.screenX < -32f ||
        splat.screenY < -32f ||
        splat.screenX > width + 32f ||
        splat.screenY > height + 32f
      ) {
        continue;
      }

      paint.setColor(Color.argb(
        Math.max(22, Math.min(150, Math.round(splat.a * 0.56f))),
        shadeChannel(splat.r, splat.viewDepth, 0.98f),
        shadeChannel(splat.g, splat.viewDepth, 0.98f),
        shadeChannel(splat.b, splat.viewDepth, 0.98f)
      ));
      canvas.drawCircle(splat.screenX, splat.screenY, splat.screenRadius * 1.85f, paint);
    }

    for (RenderSplat splat : localSplats) {
      if (
        splat.screenX < -32f ||
        splat.screenY < -32f ||
        splat.screenX > width + 32f ||
        splat.screenY > height + 32f
      ) {
        continue;
      }

      paint.setColor(Color.argb(
        Math.max(34, Math.min(225, Math.round(splat.a * 0.72f))),
        shadeChannel(splat.r, splat.viewDepth, 1.05f),
        shadeChannel(splat.g, splat.viewDepth, 1.05f),
        shadeChannel(splat.b, splat.viewDepth, 1.05f)
      ));
      canvas.drawCircle(splat.screenX, splat.screenY, Math.max(1.8f, splat.screenRadius * 1.05f), paint);
    }

    if (autoRotate) {
      postInvalidateOnAnimation();
    }
  }

  private void updateAngle() {
    long now = SystemClock.uptimeMillis();
    if (lastFrameMs == 0L) {
      lastFrameMs = now;
      return;
    }

    long delta = Math.min(48L, Math.max(0L, now - lastFrameMs));
    lastFrameMs = now;
    if (autoRotate) {
      angle = (angle + delta * 0.00055f) % ((float) Math.PI * 2f);
    }
  }

  private String getFallbackLabel() {
    return errorMessage == null ? "No native .ksplat loaded" : errorMessage;
  }

  private int shadeChannel(int channel, float depth, float boost) {
    float shade = Math.max(0.58f, Math.min(1.22f, (0.92f + depth * 0.18f) * boost));
    return Math.max(0, Math.min(255, Math.round(channel * shade)));
  }

  private void drawCenteredText(Canvas canvas, String label) {
    paint.setColor(Color.argb(220, 229, 238, 234));
    paint.setTextAlign(Paint.Align.CENTER);
    paint.setTextSize(36f);
    canvas.drawText(label, getWidth() * 0.5f, getHeight() * 0.5f, paint);
  }

  private void loadKsplat(String uri) {
    loading = true;
    errorMessage = null;
    synchronized (splatLock) {
      renderSplats.clear();
    }
    invalidate();

    loader.execute(() -> {
      try {
        List<RenderSplat> parsed = parseKsplat(uri);
        synchronized (splatLock) {
          renderSplats.clear();
          renderSplats.addAll(parsed);
        }
        loading = false;
        postInvalidateOnAnimation();
      } catch (Exception error) {
        synchronized (splatLock) {
          renderSplats.clear();
        }
        errorMessage = error.getMessage() == null ? "Native .ksplat preview failed" : error.getMessage();
        loading = false;
        postInvalidate();
      }
    });
  }

  private List<RenderSplat> parseKsplat(String uriValue) throws IOException {
    File file = fileFromUri(uriValue);
    if (!file.exists() || file.length() <= DATA_BASE) {
      throw new IOException("Generated .ksplat file is missing or too small.");
    }

    byte[] bytes = new byte[(int) file.length()];
    try (FileInputStream input = new FileInputStream(file)) {
      int offset = 0;
      while (offset < bytes.length) {
        int read = input.read(bytes, offset, bytes.length - offset);
        if (read < 0) {
          break;
        }
        offset += read;
      }
    }

    ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
    int declaredCount = buffer.getInt(12);
    int availableCount = Math.max(0, (bytes.length - DATA_BASE) / BYTES_PER_SPLAT);
    int readableCount = Math.min(declaredCount, availableCount);
    if (readableCount <= 0) {
      throw new IOException("Generated .ksplat has no readable splats.");
    }

    int stride = Math.max(1, (int) Math.ceil(readableCount / (double) MAX_RENDERED_SPLATS));
    List<RenderSplat> parsed = new ArrayList<>();
    for (int index = 0; index < readableCount; index += stride) {
      int base = DATA_BASE + index * BYTES_PER_SPLAT;
      RenderSplat splat = new RenderSplat();
      splat.x = buffer.getFloat(base);
      splat.y = buffer.getFloat(base + 4);
      splat.z = buffer.getFloat(base + 8);
      splat.scale = buffer.getFloat(base + 12);
      splat.r = bytes[base + 40] & 0xff;
      splat.g = bytes[base + 41] & 0xff;
      splat.b = bytes[base + 42] & 0xff;
      splat.a = Math.max(18, bytes[base + 43] & 0xff);
      parsed.add(splat);
    }

    return parsed;
  }

  private File fileFromUri(String uriValue) {
    Uri uri = Uri.parse(uriValue);
    if ("file".equals(uri.getScheme())) {
      return new File(uri.getPath());
    }

    return new File(uriValue);
  }

  private static class RenderSplat {
    float x;
    float y;
    float z;
    float scale;
    int r;
    int g;
    int b;
    int a;
    float screenX;
    float screenY;
    float screenRadius;
    float viewDepth;
  }
}
