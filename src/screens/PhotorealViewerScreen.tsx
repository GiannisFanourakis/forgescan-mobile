import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { shareNativeFile } from "../native/NativeFileExport";
import { RootStackParamList } from "../navigation/types";
import {
  getPhotorealFileInfo,
  isGeneratedPhotorealFile
} from "../reconstruction/splatting/photorealFile";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "PhotorealViewer">;

const previewDots = Array.from({ length: 42 }, (_, index) => index);

export function PhotorealViewerScreen({ route }: Props): ReactElement {
  const { getProject } = useProjects();
  const project = getProject(route.params.projectId);
  const spin = useRef(new Animated.Value(0)).current;
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    animation.start();
    return () => animation.stop();
  }, [spin]);

  const fileInfo = useMemo(
    () => project ? getPhotorealFileInfo(project, route.params.ksplatUri) : null,
    [project, route.params.ksplatUri]
  );
  const generated = fileInfo ? isGeneratedPhotorealFile(fileInfo) : false;
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  });

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
        <Animated.View
          style={[
            styles.dotField,
            {
              transform: [{ rotate }]
            }
          ]}
        >
          {previewDots.map((dot) => (
            <View
              key={dot}
              style={[
                styles.dot,
                {
                  left: `${dotLeft(dot)}%`,
                  top: `${dotTop(dot)}%`,
                  opacity: 0.35 + (dot % 7) * 0.08,
                  transform: [{ scale: 0.7 + (dot % 5) * 0.18 }]
                }
              ]}
            />
          ))}
        </Animated.View>
        <View style={styles.viewerLabel}>
          <Text style={styles.viewerTitle}>
            {generated ? ".ksplat preview" : "No scan file"}
          </Text>
          <Text style={styles.viewerMeta}>
            {generated
              ? "Lightweight file preview. Native splat rasterizer comes next."
              : "Run Process Clip to create the scan."}
          </Text>
        </View>
      </View>

      <Section>
        <View style={styles.fileCard}>
          <Text style={styles.fileName}>{fileInfo.filename}</Text>
          <Text style={styles.fileMeta}>Status: {generated ? "Generated" : "Not available"}</Text>
          <Text style={styles.fileMeta}>Size: {formatBytes(fileInfo.size)}</Text>
          <Text style={styles.fileMeta}>{fileInfo.path}</Text>
        </View>
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

function dotLeft(index: number): number {
  return 50 + Math.cos(index * 1.7) * (18 + (index % 4) * 6);
}

function dotTop(index: number): number {
  return 50 + Math.sin(index * 1.31) * (14 + (index % 5) * 5);
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
  dot: {
    backgroundColor: "#dfece8",
    borderRadius: 999,
    height: 9,
    position: "absolute",
    width: 9
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
