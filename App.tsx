import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import type { ReactElement } from "react";

import { ProjectProvider } from "./src/state/ProjectContext";
import { CapturePlanScreen } from "./src/screens/CapturePlanScreen";
import { CaptureRotationScreen } from "./src/screens/CaptureRotationScreen";
import { DeviceSupportScreen } from "./src/screens/DeviceSupportScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoadProjectScreen } from "./src/screens/LoadProjectScreen";
import { NewProjectScreen } from "./src/screens/NewProjectScreen";
import { ProjectReviewScreen } from "./src/screens/ProjectReviewScreen";
import { ReconstructionPlanScreen } from "./src/screens/ReconstructionPlanScreen";
import { RootStackParamList } from "./src/navigation/types";
import { colors } from "./src/ui/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App(): ReactElement {
  return (
    <ProjectProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTitleStyle: { color: colors.text },
            contentStyle: { backgroundColor: colors.background }
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="LoadProject"
            component={LoadProjectScreen}
            options={{ title: "Load Scan" }}
          />
          <Stack.Screen
            name="NewProject"
            component={NewProjectScreen}
            options={{ title: "New Scan" }}
          />
          <Stack.Screen
            name="DeviceSupport"
            component={DeviceSupportScreen}
            options={{ title: "Device Support" }}
          />
          <Stack.Screen
            name="CapturePlan"
            component={CapturePlanScreen}
            options={{ title: "Capture Rotations" }}
          />
          <Stack.Screen
            name="CaptureRotation"
            component={CaptureRotationScreen}
            options={{ title: "Capture Rotation" }}
          />
          <Stack.Screen
            name="ProjectReview"
            component={ProjectReviewScreen}
            options={{ title: "Project Review" }}
          />
          <Stack.Screen
            name="ReconstructionPlan"
            component={ReconstructionPlanScreen}
            options={{ title: "Reconstruction Plan" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ProjectProvider>
  );
}
