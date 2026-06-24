import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { shareNativeFile } from "../native/NativeFileExport";
import {
  isNativeKsplatViewAvailable,
  NativeKsplatView
} from "../native/NativeKsplatView";
import { RootStackParamList } from "../navigation/types";
import {
  getPhotorealFileInfo,
  isGeneratedPhotorealFile
} from "../reconstruction/splatting/photorealFile";
import {
  ParsedForgeScanKsplat,
  ParsedForgeScanSplat,
  parseForgeScanKsplat
} from "../splatting/ForgeScanKsplatParser";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "PhotorealViewer">;

export function PhotorealViewerScreen({ route }: Props): ReactElement {
  const { getProject } = useProjects();
  const project = getProject(route.params.projectId);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [angle, setAngle] = useState(0);
  const [parsedKsplat, setParsedKsplat] =
    useState<ParsedForgeScanKsplat | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const latestLoadUriRef = useRef<string | null>(null);

  const fileInfo = useMemo(
    () => project ? getPhotorealFileInfo(project, route.params.ksplatUri) : null,
    [project, route.params.ksplatUri]
  );
  const generated = fileInfo ? isGeneratedPhotorealFile(fileInfo) : false;
  const nativeRendererAvailable = generated && isNativeKsplatViewAvailable();

  useEffect(() => {
    if (!fileInfo || !generated) {
      setParsedKsplat(null);
      setViewerError(null);
      return;
    }

    let cancelled = false;
    latestLoadUriRef.current = fileInfo.uri;
    setViewerError(null);

    parseForgeScanKsplat(fileInfo.uri)
      .then((parsed) => {
        if (!cancelled && latestLoadUriRef.current === fileInfo.uri) {
          setParsedKsplat(parsed);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setParsedKsplat(null);
          setViewerError(
            error instanceof Error
              ? error.message
              : "Unable to parse .ksplat preview."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileInfo, generated]);

  useEffect(() => {
    const timer = setInterval(() => {
      setAngle((current) => (current + 0.025) % (Math.PI * 2));
    }, 33);

    return () => clearInterval(timer);
  }, []);

  const projectedSplats = useMemo(
    () =>
      parsedKsplat
        ? projectSplats(parsedKsplat.renderedSplats, angle)
        : [],
    [angle, parsedKsplat]
  );

  async function exportKsplat(): Promise<void> {
    if (!fileInfo || !generated) {
      setExportMessage("No generated .ksplat file is available yet.");
      return;
    }

    const result = await shareNativeFile({
      uri: fileInfo.uri,
      filename: fileInfo.filename,
      mimeType: "application/octet-stream",
      title: "Export ForgeScan .ksplat"
    });

    setExportMessage(
      result.status === "shared"
        ? "Export sheet opened."
        : result.errors[0] ?? "Unable to export .ksplat."
    );
  }

  if (!project || !fileInfo) {
    return (
      <Screen>
        <Text style={styles.title}>Scan not found</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>{project.project.title}</Text>
        <Text style={styles.meta}>
          {generated
            ? "Generated .ksplat is ready."
            : "Process the clip to generate the .ksplat first."}
        </Text>
      </Section>

      <View style={styles.viewer}>
        {nativeRendererAvailable && NativeKsplatView ? (
          <NativeKsplatView
            autoRotate
            collapsable={false}
            ksplatUri={fileInfo.uri}
            renderScale={1}
            style={styles.nativeViewer}
          />
        ) : (
          <View style={styles.dotField}>
            {projectedSplats.map((dot) => (
              <View
                key={dot.key}
                style={[
                  styles.dot,
                  {
                    backgroundColor: `rgba(${dot.r}, ${dot.g}, ${dot.b}, ${dot.opacity})`,
                    height: dot.size,
                    left: `${dot.left}%`,
                    opacity: dot.opacity,
                    top: `${dot.top}%`,
                    width: dot.size,
                    zIndex: dot.zIndex
                  }
                ]}
              />
            ))}
          </View>
        )}
        {nativeRendererAvailable ? (
          <View style={styles.rendererBadge}>
            <Text style={styles.rendererBadgeText}>Native depth-sorted preview</Text>
          </View>
        ) : null}
        <View style={styles.viewerLabel}>
          <Text style={styles.viewerTitle}>
            {generated ? ".ksplat preview" : "No scan file"}
          </Text>
          <Text style={styles.viewerMeta}>
            {generated && parsedKsplat
              ? `${parsedKsplat.splatCount} splats loaded`
              : generated
                ? "Loading splats..."
              : "Run Process Clip to create the scan."}
          </Text>
        </View>
      </View>

      <Section>
        <View style={styles.fileCard}>
          <Text style={styles.fileName}>{fileInfo.filename}</Text>
          <Text style={styles.fileMeta}>Status: {generated ? "Generated" : "Not available"}</Text>
          <Text style={styles.fileMeta}>Size: {formatBytes(fileInfo.size)}</Text>
          {parsedKsplat ? (
            <Text style={styles.fileMeta}>
              Preview: {parsedKsplat.renderedSplats.length}/{parsedKsplat.splatCount} splats
            </Text>
          ) : null}
          <Text style={styles.fileMeta}>
            Renderer: {nativeRendererAvailable
              ? "Android native depth sorting + alpha blending"
              : "JavaScript fallback"}
          </Text>
          <Text style={styles.fileMeta}>{fileInfo.path}</Text>
        </View>
        {viewerError ? (
          <Text style={styles.message}>{viewerError}</Text>
        ) : null}
        {parsedKsplat?.warnings.map((warning) => (
          <Text key={warning} style={styles.message}>
            {warning}
          </Text>
        ))}
        <Button
          disabled={!generated}
          label="Export .ksplat"
          onPress={() => {
            void exportKsplat();
          }}
        />
        {exportMessage ? (
          <Text style={styles.message}>{exportMessage}</Text>
        ) : null}
      </Section>
    </Screen>
  );
}

interface ProjectedSplat {
  key: string;
  left: number;
  top: number;
  size: number;
  r: number;
  g: number;
  b: number;
  opacity: number;
  zIndex: number;
}

function projectSplats(
  splats: ParsedForgeScanSplat[],
  angle: number
): ProjectedSplat[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return splats
    .map((splat, index) => {
      const viewX = splat.x * cos - splat.z * sin;
      const viewZ = splat.x * sin + splat.z * cos;
      const perspective = 1.05 / Math.max(0.35, 1.2 + viewZ * 0.35);
      const left = clamp(50 + viewX * perspective * 55, 1, 99);
      const top = clamp(50 - splat.y * perspective * 58, 1, 99);
      const size = clamp(5 + splat.scale * 260 * perspective, 3, 18);

      return {
        key: `${index}-${splat.x.toFixed(3)}-${splat.y.toFixed(3)}`,
        left,
        top,
        size,
        r: splat.r,
        g: splat.g,
        b: splat.b,
        opacity: clamp(splat.a / 255, 0.18, 0.95),
        zIndex: Math.round((viewZ + 2) * 1000)
      };
    })
    .sort((a, b) => a.zIndex - b.zIndex);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900"
  },
  meta: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  viewer: {
    alignItems: "center",
    aspectRatio: 0.78,
    backgroundColor: "#101817",
    borderRadius: 8,
    justifyContent: "center",
    overflow: "hidden"
  },
  dotField: {
    height: "72%",
    position: "relative",
    width: "86%"
  },
  nativeViewer: {
    ...StyleSheet.absoluteFillObject
  },
  dot: {
    borderRadius: 999,
    position: "absolute",
    shadowColor: "#ffffff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 5
  },
  viewerLabel: {
    alignItems: "center",
    bottom: spacing.lg,
    gap: 4,
    left: spacing.md,
    position: "absolute",
    right: spacing.md
  },
  viewerTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900"
  },
  viewerMeta: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center"
  },
  rendererBadge: {
    backgroundColor: "rgba(217, 234, 223, 0.13)",
    borderColor: "rgba(217, 234, 223, 0.3)",
    borderRadius: 999,
    borderWidth: 1,
    left: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    position: "absolute",
    top: spacing.md
  },
  rendererBadgeText: {
    color: "#d9eadf",
    fontSize: 11,
    fontWeight: "900"
  },
  fileCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: spacing.md
  },
  fileName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900"
  },
  fileMeta: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18
  },
  message: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  }
});
