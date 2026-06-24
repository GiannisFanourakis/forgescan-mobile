import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ForgeScanLogo } from "../components/ForgeScanLogo";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props): ReactElement {
  const { projects } = useProjects();
  const recentProject = projects[0];
  const recentVideoCount =
    recentProject?.capture.rotations.reduce(
      (sum, rotation) => sum + (rotation.videos?.length ?? 0),
      0
    ) ?? 0;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <ForgeScanLogo showWordmark />
        </View>

        <View style={styles.previewPanel}>
          <View style={styles.previewGrid}>
            <View style={styles.previewRing} />
            <View style={styles.previewLineHorizontal} />
            <View style={styles.previewLineVertical} />
          </View>
          <View style={styles.previewBrand}>
            <ForgeScanLogo size={72} />
            <View style={styles.previewText}>
              <Text style={styles.title}>ForgeScan</Text>
              <Text style={styles.subtitle}>Controlled Object Splatting</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionGrid}>
          <ActionCard
            label="Capture"
            meta="New scan"
            tone="primary"
            onPress={() => navigation.navigate("NewProject")}
          />
          <ActionCard
            label="Load"
            meta={`${projects.length} saved`}
            tone="secondary"
            onPress={() => navigation.navigate("LoadProject")}
          />
        </View>

        <View style={styles.statusGrid}>
          <Metric label="Format" value=".ksplat" />
          <Metric label="Device" value="Android iOS" />
        </View>

        {recentProject ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate("CapturePlan", {
                projectId: recentProject.project.id
              })
            }
            style={({ pressed }) => [
              styles.recentProject,
              pressed ? styles.pressed : undefined
            ]}
          >
            <View style={styles.recentText}>
              <Text style={styles.recentLabel}>Recent scan</Text>
              <Text style={styles.recentTitle}>{recentProject.project.title}</Text>
            </View>
            <Text style={styles.recentMeta}>
              {recentVideoCount} clip{recentVideoCount === 1 ? "" : "s"}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

interface ActionCardProps {
  label: string;
  meta: string;
  tone: "primary" | "secondary";
  onPress: () => void;
}

function ActionCard({
  label,
  meta,
  tone,
  onPress
}: ActionCardProps): ReactElement {
  const isPrimary = tone === "primary";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        isPrimary ? styles.actionPrimary : styles.actionSecondary,
        pressed ? styles.pressed : undefined
      ]}
    >
      <Text
        style={[
          styles.actionLabel,
          isPrimary ? styles.actionPrimaryLabel : styles.actionSecondaryLabel
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.actionMeta,
          isPrimary ? styles.actionPrimaryMeta : styles.actionSecondaryMeta
        ]}
      >
        {meta}
      </Text>
    </Pressable>
  );
}

interface MetricProps {
  label: string;
  value: string;
}

function Metric({ label, value }: MetricProps): ReactElement {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1
  },
  content: {
    flex: 1,
    flexGrow: 1,
    gap: spacing.md,
    justifyContent: "center",
    padding: spacing.md,
    paddingBottom: spacing.xl
  },
  brandRow: {
    alignItems: "flex-start"
  },
  previewPanel: {
    backgroundColor: "#101817",
    borderRadius: 8,
    minHeight: 248,
    overflow: "hidden",
    padding: spacing.lg,
    position: "relative",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 3
  },
  previewGrid: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  previewRing: {
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 999,
    borderWidth: 2,
    height: "54%",
    width: "70%"
  },
  previewLineHorizontal: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    height: 1,
    position: "absolute",
    width: "76%"
  },
  previewLineVertical: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    height: "62%",
    position: "absolute",
    width: 1
  },
  previewBrand: {
    alignItems: "flex-start",
    flex: 1,
    gap: spacing.md,
    justifyContent: "flex-end"
  },
  previewText: {
    gap: 4
  },
  title: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 38
  },
  subtitle: {
    color: "#dfece8",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22,
    textTransform: "uppercase"
  },
  actionGrid: {
    flexDirection: "row",
    gap: spacing.sm
  },
  actionCard: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 118,
    justifyContent: "space-between",
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 2
  },
  actionPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  actionSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border
  },
  actionLabel: {
    fontSize: 25,
    fontWeight: "900"
  },
  actionPrimaryLabel: {
    color: "#ffffff"
  },
  actionSecondaryLabel: {
    color: colors.text
  },
  actionMeta: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  actionPrimaryMeta: {
    color: "#dff1ef"
  },
  actionSecondaryMeta: {
    color: colors.mutedText
  },
  statusGrid: {
    flexDirection: "row",
    gap: spacing.sm
  },
  metric: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: spacing.md
  },
  metricValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  metricLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  recentProject: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md
  },
  recentText: {
    flex: 1,
    gap: 2
  },
  recentLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  recentTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  recentMeta: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "900"
  },
  pressed: {
    opacity: 0.78
  }
});
