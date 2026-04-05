import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Project, Library } from '../types';
import { fetchProject, updateProject as apiUpdateProject, deleteProject as apiDeleteProject, renameProjectFolder } from '../api';
import { ProjectViewer } from './ProjectViewer';
import { Loader2 } from 'lucide-react';

interface ContextType {
  libraries: Library[];
  refreshProjects: () => Promise<void>;
}

export function ProjectRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { libraries, refreshProjects } = useOutletContext<ContextType>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProject = async () => {
    if (!id) return;
    try {
      const proj = await fetchProject(id);
      setProject(proj);
    } catch (e) {
      console.error(e);
      setProject(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadProject();
  }, [id]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return <div className="p-8 text-neutral-500">Project not found.</div>;
  }

  const onUpdate = async (updatedProject: Project) => {
    const idChanged = updatedProject.id !== project.id;

    if (idChanged) {
      try {
        await renameProjectFolder(project.id, updatedProject.id);
      } catch (e) {
        console.error("Failed to rename project folder:", e);
        alert("Failed to rename project folder. Reverting ID change.");
        updatedProject = { ...updatedProject, id: project.id };
      }
    }

    try {
      await apiUpdateProject(project.id, {
        name: updatedProject.name,
        workflow: updatedProject.workflow,
        jobs: updatedProject.jobs,
        aspectRatio: updatedProject.aspectRatio,
        quality: updatedProject.quality,
        format: updatedProject.format,
        shuffle: updatedProject.shuffle,
        modelConfigId: updatedProject.modelConfigId,
      });
      setProject(updatedProject);
    } catch (e) {
      console.error('Failed to update project:', e);
    }

    if (idChanged && updatedProject.id !== project.id) {
      navigate(`/project/${updatedProject.id}`, { replace: true });
    }
  };

  const onDelete = async () => {
    if (!id) return;
    try {
      await apiDeleteProject(id);
      await refreshProjects();
      navigate('/');
    } catch (e) {
      console.error(e);
    }
  };

  return <ProjectViewer project={project} libraries={libraries} onUpdate={onUpdate} onDelete={onDelete} />;
}
