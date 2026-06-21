import {
  PropsWithChildren,
  ReactElement,
  createContext,
  useEffect,
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
import {
  createStoredFrameUri,
  ensureProjectStorage,
  loadStoredProjectManifests,
  persistProjectManifest
} from "../storage/projectStorage";

interface ProjectContextValue {
  projects: ForgeScanProjectManifest[];
  isLoadingProjects: boolean;
  storageError: string | null;
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
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    loadStoredProjectManifests()
      .then((storedProjects) => {
        if (isMounted) {
          setProjects(storedProjects);
          setStorageError(null);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setStorageError(createErrorMessage(error));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingProjects(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateProject = useCallback(
    (
      projectId: string,
      updater: (project: ForgeScanProjectManifest) => ForgeScanProjectManifest
    ) => {
      setProjects((currentProjects) =>
        currentProjects.map((project) => {
          if (project.project.id !== projectId) {
            return project;
          }

          const updatedProject = updater(project);
          persistProjectManifest(updatedProject);
          return updatedProject;
        })
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

      ensureProjectStorage(manifest);
      persistProjectManifest(manifest);
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
      updateProject(projectId, (project) => {
        const rotation = project.capture.rotations.find(
          (candidate) => candidate.id === rotationId
        );
        const nextFrameIndex =
          rotation && rotation.frames.length > 0
            ? Math.max(...rotation.frames.map((frame) => frame.index)) + 1
            : 1;

        return addFrameToRotation(project, rotationId, {
          uri: createStoredFrameUri(project, rotationId, nextFrameIndex),
          width: 1600,
          height: 1600,
          qualityChecks: {
            blur: "not-run",
            exposure: "not-run",
            centered: "not-run",
            notes: ["Simulated capture frame."]
          }
        });
      });
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
      isLoadingProjects,
      storageError,
      createProject,
      getProject,
      startRotation,
      addSimulatedFrame,
      retakeLastFrame,
      completeRotation
    }),
    [
      projects,
      isLoadingProjects,
      storageError,
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

function createErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to read local projects.";
}
