import {
  PropsWithChildren,
  ReactElement,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from "react";

import {
  ForgeScanProjectManifest,
  RotationId,
  addFrameToRotation,
  createNewProjectManifest,
  markRotationComplete,
  removeLastFrameFromRotation,
  setRotationStatus
} from "../core/manifest";

interface ProjectContextValue {
  projects: ForgeScanProjectManifest[];
  createProject: (
    title: string,
    targetFrameCount: number,
    includeUnderside: boolean
  ) => ForgeScanProjectManifest;
  getProject: (projectId: string) => ForgeScanProjectManifest | undefined;
  startRotation: (projectId: string, rotationId: RotationId) => void;
  addSimulatedFrame: (projectId: string, rotationId: RotationId) => void;
  retakeLastFrame: (projectId: string, rotationId: RotationId) => void;
  completeRotation: (projectId: string, rotationId: RotationId) => void;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(
  undefined
);

export function ProjectProvider({
  children
}: PropsWithChildren): ReactElement {
  const [projects, setProjects] = useState<ForgeScanProjectManifest[]>([]);

  const updateProject = useCallback(
    (
      projectId: string,
      updater: (project: ForgeScanProjectManifest) => ForgeScanProjectManifest
    ) => {
      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.project.id === projectId ? updater(project) : project
        )
      );
    },
    []
  );

  const createProject = useCallback(
    (
      title: string,
      targetFrameCount: number,
      includeUnderside: boolean
    ): ForgeScanProjectManifest => {
      const manifest = createNewProjectManifest({
        title,
        targetFrameCount,
        includeUnderside
      });

      setProjects((currentProjects) => [manifest, ...currentProjects]);
      return manifest;
    },
    []
  );

  const getProject = useCallback(
    (projectId: string): ForgeScanProjectManifest | undefined =>
      projects.find((project) => project.project.id === projectId),
    [projects]
  );

  const startRotation = useCallback(
    (projectId: string, rotationId: RotationId) => {
      updateProject(projectId, (project) =>
        setRotationStatus(project, rotationId, "capturing")
      );
    },
    [updateProject]
  );

  const addSimulatedFrame = useCallback(
    (projectId: string, rotationId: RotationId) => {
      updateProject(projectId, (project) =>
        addFrameToRotation(project, rotationId, {
          width: 1600,
          height: 1600,
          qualityChecks: {
            blur: "not-run",
            exposure: "not-run",
            centered: "not-run",
            notes: ["Simulated capture frame."]
          }
        })
      );
    },
    [updateProject]
  );

  const retakeLastFrame = useCallback(
    (projectId: string, rotationId: RotationId) => {
      updateProject(projectId, (project) =>
        removeLastFrameFromRotation(project, rotationId)
      );
    },
    [updateProject]
  );

  const completeRotation = useCallback(
    (projectId: string, rotationId: RotationId) => {
      updateProject(projectId, (project) =>
        markRotationComplete(project, rotationId)
      );
    },
    [updateProject]
  );

  const value = useMemo(
    () => ({
      projects,
      createProject,
      getProject,
      startRotation,
      addSimulatedFrame,
      retakeLastFrame,
      completeRotation
    }),
    [
      projects,
      createProject,
      getProject,
      startRotation,
      addSimulatedFrame,
      retakeLastFrame,
      completeRotation
    ]
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProjects(): ProjectContextValue {
  const value = useContext(ProjectContext);

  if (!value) {
    throw new Error("useProjects must be used inside ProjectProvider.");
  }

  return value;
}
