import { PropsWithChildren, ReactElement } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View
} from "react-native";

import { spacing } from "../ui/theme";

export function Screen({ children }: PropsWithChildren): ReactElement {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Section({ children }: PropsWithChildren): ReactElement {
  return <View style={styles.section}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  content: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xl
  },
  section: {
    gap: spacing.sm
  }
});
