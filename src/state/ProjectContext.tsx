import {
  PropsWithChildren,
  ReactElement,
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";

import {
  ForgeScanProjectManifest,
  ReconstructionModelId,
  RotationId,
  addFrameToRotation,
  addVideoToRotation,
  createNewProjectManifest,
  markRotationComplete,
  removeLastFrameFromRotation,
  removeLastVideoFromRotation,
  setReconstructionModel,
  setRotationStatus
} from "../core/manifest";
import {
  createReconstructionModelSelection,
  getReconstructionModel
} from "../reconstruction/modelRegistry";
import {
  copyCapturedFrameToProject,
  copyCapturedVideoToProject,
  deleteProjectStorage,
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

interface CapturedVideoInput {
  uri: string;
  durationMs?: number;
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
  deleteProject: (projectId: string) => void;
  getProject: (projectId: string) => ForgeScanProjectManifest | undefined;
  startRotation: (projectId: string, rotationId: RotationId) => void;
  addCapturedFrame: (
    projectId: string,
    rotationId: RotationId,
    photo: CapturedPhotoInput
  ) => Promise<void>;
  addCapturedVideo: (
    projectId: string,
    rotationId: RotationId,
    video: CapturedVideoInput
  ) => Promise<void>;
  retakeLastFrame: (projectId: string, rotationId: RotationId) => void;
  deleteLastVideo: (projectId: string, rotationId: RotationId) => void;
  completeRotation: (projectId: string, rotationId: RotationId) => void;
  selectReconstructionModel: (
    projectId: string,
    modelId: ReconstructionModelId
  ) => void;
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
  const projectsRef = useRef<ForgeScanProjectManifest[]>([]);

  useEffect(() => {
    let isMounted = true;

    loadStoredProjectManifests()
      .then((storedProjects) => {
        if (isMounted) {
          projectsRef.current = storedProjects;
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

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const updateProject = useCallback(
    (
      projectId: string,
      updater: (project: ForgeScanProjectManifest) => ForgeScanProjectManifest
    ) => {
      setProjects((currentProjects) => {
        const updatedProjects = currentProjects.map((project) => {
          if (project.project.id !== projectId) {
            return project;
          }

          const updatedProject = updater(project);
          persistProjectManifest(updatedProject);
          return updatedProject;
        });

        projectsRef.current = updatedProjects;
        return updatedProjects;
      });
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
      setProjects((currentProjects) => {
        const updatedProjects = [manifest, ...currentProjects];
        projectsRef.current = updatedProjects;
        return updatedProjects;
      });
      return manifest;
    },
    []
  );

  const deleteProject = useCallback((projectId: string) => {
    deleteProjectStorage(projectId);
    setProjects((currentProjects) => {
      const updatedProjects = currentProjects.filter(
        (project) => project.project.id !== projectId
      );
      projectsRef.current = updatedProjects;
      return updatedProjects;
    });
  }, []);

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
      const currentProject = projectsRef.current.find(
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
      const updatedProjects = projectsRef.current.map((project) =>
        project.project.id === projectId ? updatedProject : project
      );

      projectsRef.current = updatedProjects;
      setProjects(updatedProjects);
    },
    []
  );

  const addCapturedVideo = useCallback(
    async (
      projectId: string,
      rotationId: RotationId,
      video: CapturedVideoInput
    ) => {
      const currentProject = projectsRef.current.find(
        (project) => project.project.id === projectId
      );
      const rotation = currentProject?.capture.rotations.find(
        (candidate) => candidate.id === rotationId
      );

      if (!currentProject || !rotation) {
        return;
      }

      const videos = rotation.videos ?? [];
      const nextVideoIndex =
        videos.length > 0
          ? Math.max(...videos.map((storedVideo) => storedVideo.index)) + 1
          : 1;
      const storedUri = await copyCapturedVideoToProject(
        currentProject,
        rotationId,
        video.uri,
        nextVideoIndex
      );
      const updatedProject = addVideoToRotation(currentProject, rotationId, {
        uri: storedUri,
        ...(video.durationMs !== undefined
          ? { durationMs: video.durationMs }
          : {})
      });

      persistProjectManifest(updatedProject);
      const updatedProjects = projectsRef.current.map((project) =>
        project.project.id === projectId ? updatedProject : project
      );

      projectsRef.current = updatedProjects;
      setProjects(updatedProjects);
    },
    []
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

  const deleteLastVideo = useCallback(
    (projectId: string, rotationId: RotationId) => {
      updateProject(projectId, (project) =>
        {
          const rotation = project.capture.rotations.find(
            (candidate) => candidate.id === rotationId
          );
          const videos = rotation?.videos ?? [];
          const lastVideo = videos[videos.length - 1];

          if (lastVideo) {
            deleteStoredFile(lastVideo.uri);
          }

          return removeLastVideoFromRotation(project, rotationId);
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

  const selectReconstructionModel = useCallback(
    (projectId: string, modelId: ReconstructionModelId) => {
      const model = getReconstructionModel(modelId);
      updateProject(projectId, (project) =>
        setReconstructionModel(project, {
          engine: model.engine,
          model: createReconstructionModelSelection(model),
          targetFormats: model.targetFormats,
          note: `${model.label} selected for reconstruction planning.`
        })
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
      deleteProject,
      getProject,
      startRotation,
      addCapturedFrame,
      addCapturedVideo,
      retakeLastFrame,
      deleteLastVideo,
      completeRotation,
      selectReconstructionModel
    }),
    [
      projects,
      isLoadingProjects,
      storageError,
      createProject,
      deleteProject,
      getProject,
      startRotation,
      addCapturedFrame,
      addCapturedVideo,
      retakeLastFrame,
      deleteLastVideo,
      completeRotation,
      selectReconstructionModel
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
