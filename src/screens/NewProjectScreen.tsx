import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ReactElement, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "../components/Button";
import { Screen, Section } from "../components/Screen";
import { RootStackParamList } from "../navigation/types";
import { useProjects } from "../state/ProjectContext";
import { colors, spacing } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "NewProject">;

const frameCounts = [24, 72, 120, 180] as const;

export function NewProjectScreen({ navigation }: Props): ReactElement {
  const { createProject } = useProjects();
  const [title, setTitle] = useState("Object scan");
  const [targetFrameCount, setTargetFrameCount] = useState<number>(72);
  const [customFrameCount, setCustomFrameCount] = useState("72");
  const [includeUnderside, setIncludeUnderside] = useState(false);

  function handleCreateProject(): void {
    const project = createProject(
      title,
      Math.max(1, targetFrameCount),
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
        <Text style={styles.label}>Recommended frame guidance</Text>
        <Text style={styles.helperText}>
          This is not a limit. You can keep capturing until you tap Complete
          Rotation.
        </Text>
        <View style={styles.optionGrid}>
          {frameCounts.map((count) => (
            <Choice
              key={count}
              label={`${count}`}
              selected={targetFrameCount === count}
              onPress={() => {
                setTargetFrameCount(count);
                setCustomFrameCount(String(count));
              }}
            />
          ))}
        </View>
        <TextInput
          keyboardType="number-pad"
          onChangeText={(value) => {
            setCustomFrameCount(value);
            const parsedValue = Number.parseInt(value, 10);
            if (Number.isFinite(parsedValue) && parsedValue > 0) {
              setTargetFrameCount(parsedValue);
            }
          }}
          placeholder="Custom recommended frames"
          placeholderTextColor={colors.mutedText}
          style={styles.input}
          value={customFrameCount}
        />
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
