import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "NewProject">;

const frameCounts = [24, 36, 72, 120] as const;

export function NewProjectScreen({ navigation }: Props): ReactElement {
  const { createProject } = useProjects();
  const [title, setTitle] = useState("");
  const [targetFrameCount, setTargetFrameCount] = useState<number>(36);
  const [includeUnderside, setIncludeUnderside] = useState(false);

  function handleCreateProject(): void {
    const project = createProject(title, targetFrameCount, includeUnderside);
    navigation.replace("CapturePlan", { projectId: project.project.id });
  }

  return (
    <Screen>
      <Section>
        <Text style={styles.label}>Project title</Text>
        <TextInput
          onChangeText={setTitle}
          placeholder="Object scan"
          placeholderTextColor={colors.mutedText}
          style={styles.input}
          value={title}
        />
      </Section>

      <Section>
        <Text style={styles.label}>Target frame count</Text>
        <View style={styles.optionGrid}>
          {frameCounts.map((count) => (
            <Choice
              key={count}
              label={`${count}`}
              selected={targetFrameCount === count}
              onPress={() => setTargetFrameCount(count)}
            />
          ))}
        </View>
      </Section>

      <Section>
        <Text style={styles.label}>Capture plan</Text>
        <View style={styles.planOptions}>
          <Choice
            label="2 rotations: upright + tilted"
            selected={!includeUnderside}
            onPress={() => setIncludeUnderside(false)}
          />
          <Choice
            label="3 rotations: upright + tilted + underside"
            selected={includeUnderside}
            onPress={() => setIncludeUnderside(true)}
          />
        </View>
      </Section>

      <Button label="Create Project" onPress={handleCreateProject} />
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
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
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
    paddingVertical: spacing.sm
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
