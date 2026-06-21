import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, spacing } from "../ui/theme";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false
}: ButtonProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && !disabled ? styles.pressed : undefined,
        disabled ? styles.disabled : undefined
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === "primary" ? styles.primaryLabel : styles.secondaryLabel,
          disabled ? styles.disabledLabel : undefined
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border
  },
  danger: {
    backgroundColor: colors.surface,
    borderColor: colors.danger
  },
  pressed: {
    opacity: 0.82
  },
  disabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border
  },
  label: {
    fontSize: 16,
    fontWeight: "700"
  },
  primaryLabel: {
    color: "#ffffff"
  },
  secondaryLabel: {
    color: colors.text
  },
  disabledLabel: {
    color: colors.mutedText
  }
});
