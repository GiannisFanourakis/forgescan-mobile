import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Screen, Section } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import {
  getCurrentPlatformEngine,
  getRuntimePlatformLabel,
  platformReconstructionEngines
} from "../reconstruction/engineRegistry";
import { CapabilityStatus } from "../reconstruction/types";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "DeviceSupport">;

export function DeviceSupportScreen(_props: Props): ReactElement {
  const currentEngine = getCurrentPlatformEngine();
  const currentPlatformLabel = getRuntimePlatformLabel();

  return (
    <Screen>
      <Section>
        <Text style={styles.title}>Android and iOS versions</Text>
        <Text style={styles.meta}>
          Current runtime: {currentPlatformLabel}
        </Text>
      </Section>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {currentEngine
            ? `${currentEngine.displayName} is selected for this device.`
            : "This preview runtime uses shared capture only."}
        </Text>
        <Text style={styles.summaryMeta}>
          Splat optimization will use native modules when the app moves beyond
          Expo Go.
        </Text>
      </View>

      <Section>
        {platformReconstructionEngines.map((engine) => (
          <View key={engine.platform} style={styles.platformCard}>
            <View style={styles.platformHeader}>
              <View style={styles.platformTitleGroup}>
                <Text style={styles.platformTitle}>{engine.displayName}</Text>
                <Text style={styles.platformMeta}>
                  Module: {engine.nativeModuleName}
                </Text>
              </View>
              <StatusLabel status={engine.implementationStatus} />
            </View>

            <Text style={styles.platformSummary}>{engine.summary}</Text>

            <View style={styles.capabilityList}>
              {engine.capabilities.map((capability) => (
                <View key={capability.id} style={styles.capabilityRow}>
                  <View style={styles.capabilityText}>
                    <Text style={styles.capabilityTitle}>
                      {capability.label}
                    </Text>
                    <Text style={styles.capabilityDetail}>
                      {capability.detail}
                    </Text>
                  </View>
                  <CapabilityBadge status={capability.status} />
                </View>
              ))}
            </View>

            <View style={styles.roadmapList}>
              {engine.roadmap.map((item) => (
                <View key={item.order} style={styles.roadmapRow}>
                  <Text style={styles.roadmapNumber}>{item.order}</Text>
                  <View style={styles.roadmapText}>
                    <Text style={styles.roadmapTitle}>{item.title}</Text>
                    <Text style={styles.roadmapDetail}>{item.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </Section>
    </Screen>
  );
}

interface CapabilityBadgeProps {
  status: CapabilityStatus;
}

function CapabilityBadge({ status }: CapabilityBadgeProps): ReactElement {
  return (
    <View style={[styles.badge, styles[status]]}>
      <Text style={styles.badgeText}>{formatStatus(status)}</Text>
    </View>
  );
}

interface StatusLabelProps {
  status: string;
}

function StatusLabel({ status }: StatusLabelProps): ReactElement {
  return (
    <View style={[styles.badge, styles.statusBadge]}>
      <Text style={styles.badgeText}>{formatStatus(status)}</Text>
    </View>
  );
}

function formatStatus(status: string): string {
  return status.replace(/-/g, " ");
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800"
  },
  meta: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  summary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  summaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  summaryMeta: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  platformCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md
  },
  platformHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  platformTitleGroup: {
    flex: 1,
    gap: 2
  },
  platformTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800"
  },
  platformMeta: {
    color: colors.mutedText,
    fontSize: 13
  },
  platformSummary: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20
  },
  capabilityList: {
    gap: spacing.sm
  },
  capabilityRow: {
    alignItems: "flex-start",
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingTop: spacing.sm
  },
  capabilityText: {
    flex: 1,
    gap: 2
  },
  capabilityTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  capabilityDetail: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  badgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  available: {
    backgroundColor: "#d9eadf"
  },
  "requires-native-build": {
    backgroundColor: "#efe5d2"
  },
  planned: {
    backgroundColor: "#dfece8"
  },
  unsupported: {
    backgroundColor: "#f0d8d5"
  },
  statusBadge: {
    backgroundColor: colors.surfaceMuted
  },
  roadmapList: {
    gap: spacing.sm
  },
  roadmapRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  roadmapNumber: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800",
    width: 20
  },
  roadmapText: {
    flex: 1,
    gap: 2
  },
  roadmapTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  roadmapDetail: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18
  }
});
