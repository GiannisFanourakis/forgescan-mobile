import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "../ui/theme";

interface ForgeScanLogoProps {
  size?: number;
  showWordmark?: boolean;
}

export function ForgeScanLogo({
  size = 86,
  showWordmark = false
}: ForgeScanLogoProps): ReactElement {
  const ringSize = size * 0.58;
  const coreSize = size * 0.28;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.mark,
          {
            borderRadius: size * 0.23,
            height: size,
            width: size
          }
        ]}
      >
        <View
          style={[
            styles.outerRing,
            {
              borderRadius: ringSize / 2,
              height: ringSize,
              width: ringSize
            }
          ]}
        />
        <View
          style={[
            styles.core,
            {
              borderRadius: coreSize / 2,
              height: coreSize,
              width: coreSize
            }
          ]}
        />
        <View style={styles.scanLine} />
        <View style={styles.blueFacet} />
        <View style={styles.amberFacet} />
      </View>
      {showWordmark ? (
        <View style={styles.wordmark}>
          <Text style={styles.wordmarkTitle}>ForgeScan</Text>
          <Text style={styles.wordmarkMeta}>mobile capture</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  mark: {
    alignItems: "center",
    backgroundColor: colors.text,
    borderColor: "rgba(255, 255, 255, 0.72)",
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 4
  },
  outerRing: {
    borderColor: "#e8f5f2",
    borderWidth: 3,
    position: "absolute"
  },
  core: {
    backgroundColor: colors.accent,
    borderColor: "#f7fbfa",
    borderWidth: 3,
    position: "absolute"
  },
  scanLine: {
    backgroundColor: "#ffffff",
    height: 3,
    opacity: 0.86,
    position: "absolute",
    transform: [{ rotate: "-18deg" }],
    width: "72%"
  },
  blueFacet: {
    backgroundColor: colors.sky,
    borderRadius: 999,
    height: "18%",
    position: "absolute",
    right: "17%",
    top: "17%",
    width: "18%"
  },
  amberFacet: {
    backgroundColor: colors.amber,
    borderRadius: 999,
    bottom: "18%",
    height: "13%",
    left: "20%",
    position: "absolute",
    width: "13%"
  },
  wordmark: {
    gap: 2
  },
  wordmarkTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900"
  },
  wordmarkMeta: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  }
});
