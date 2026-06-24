import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "NewProject">;

const VIDEO_DERIVED_FRAME_GUIDE = 72;

export function NewProjectScreen({ navigation }: Props): ReactElement {
  const { createProject } = useProjects();
  const [title, setTitle] = useState("New clip");
  const [includeUnderside, setIncludeUnderside] = useState(false);

  function handleCreateProject(): void {
    const project = createProject(
      title,
      VIDEO_DERIVED_FRAME_GUIDE,
      includeUnderside
    );
    navigation.replace("CapturePlan", { projectId: project.project.id });
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.label}>Project title</Text>
        <TextInput
          onChangeText={setTitle}
          style={styles.input}
          value={title}
        />
      </Section>

      <Section>
        <Text style={styles.label}>Clip capture</Text>
        <Text style={styles.helperText}>
          Record one smooth full-turn clip for each rotation. ForgeScan handles
          the rest during processing.
        </Text>
        <View style={styles.captureSummary}>
          <Text style={styles.captureSummaryTitle}>Simple clip scan</Text>
          <Text style={styles.captureSummaryText}>
            1 clip per rotation
          </Text>
        </View>
      </Section>

      <Section>
        <Text style={styles.label}>Rotations</Text>
        <View style={styles.planOptions}>
          <Choice
            label="2 rotations"
            selected={!includeUnderside}
            onPress={() => setIncludeUnderside(false)}
          />
          <Choice
            label="3 rotations"
            selected={includeUnderside}
            onPress={() => setIncludeUnderside(true)}
          />
        </View>
      </Section>

      <Button label="Create Clip" onPress={handleCreateProject} />
    </Screen>
  );
}

interface ChoiceProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function Choice({ label, selected, onPress }: ChoiceProps): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.choice, selected ? styles.choiceSelected : undefined]}
    >
      <Text
        style={[
          styles.choiceText,
          selected ? styles.choiceTextSelected : undefined
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  helperText: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 18
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1
  },
  captureSummary: {
    backgroundColor: "#dfece8",
    borderColor: colors.accent,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: spacing.md
  },
  captureSummaryTitle: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "900"
  },
  captureSummaryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18
  },
  planOptions: {
    gap: spacing.sm
  },
  choice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1
  },
  choiceSelected: {
    backgroundColor: "#dfece8",
    borderColor: colors.accent
  },
  choiceText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700"
  },
  choiceTextSelected: {
    color: colors.accent
  }
});
