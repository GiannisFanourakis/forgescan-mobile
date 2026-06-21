import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { RotationStatus } from "../core/manifest";
import { colors, spacing } from "../ui/theme";

interface StatusPillProps {
  status: RotationStatus | "optional" | "ready" | "blocked";
}

export function StatusPill({ status }: StatusPillProps): ReactElement {
  return (
    <View style={[styles.pill, styles[status]]}>
      <Text style={styles.text}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  text: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize"
  },
  pending: {
    backgroundColor: colors.surfaceMuted
  },
  capturing: {
    backgroundColor: "#dfece8"
  },
  complete: {
    backgroundColor: "#d9eadf"
  },
  optional: {
    backgroundColor: "#efe5d2"
  },
  ready: {
    backgroundColor: "#d9eadf"
  },
  blocked: {
    backgroundColor: "#f0d8d5"
  }
});
