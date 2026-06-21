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
  copyCapturedFrameToProject,
  deleteStoredFile,
  ensureProjectStorage,
  loadStoredProjectManifests,
  persistProjectManifest
} from "../storage/projectStorage";

interface CapturedPhotoInput {
  uri: string;
  width?: number;
  height?: number;
}

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
  addCapturedFrame: (
    projectId: string,
    rotationId: RotationId,
    photo: CapturedPhotoInput
  ) => Promise<void>;
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

  const addCapturedFrame = useCallback(
    async (
      projectId: string,
      rotationId: RotationId,
      photo: CapturedPhotoInput
    ) => {
      const currentProject = projects.find(
        (project) => project.project.id === projectId
      );
      const rotation = currentProject?.capture.rotations.find(
        (candidate) => candidate.id === rotationId
      );

      if (!currentProject || !rotation) {
        return;
      }

      const nextFrameIndex =
        rotation.frames.length > 0
          ? Math.max(...rotation.frames.map((frame) => frame.index)) + 1
          : 1;
      const storedUri = await copyCapturedFrameToProject(
        currentProject,
        rotationId,
        photo.uri,
        nextFrameIndex
      );
      const updatedProject = addFrameToRotation(currentProject, rotationId, {
        uri: storedUri,
        qualityChecks: {
          blur: "not-run",
          exposure: "not-run",
          centered: "not-run",
          notes: []
        },
        ...(photo.width !== undefined ? { width: photo.width } : {}),
        ...(photo.height !== undefined ? { height: photo.height } : {})
      });

      persistProjectManifest(updatedProject);
      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.project.id === projectId ? updatedProject : project
        )
      );
    },
    [projects]
  );

  const retakeLastFrame = useCallback(
    (projectId: string, rotationId: RotationId) => {
      updateProject(projectId, (project) =>
        {
          const rotation = project.capture.rotations.find(
            (candidate) => candidate.id === rotationId
          );
          const lastFrame = rotation?.frames[rotation.frames.length - 1];

          if (lastFrame) {
            deleteStoredFile(lastFrame.uri);
          }

          return removeLastFrameFromRotation(project, rotationId);
        }
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
      addCapturedFrame,
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
      addCapturedFrame,
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
