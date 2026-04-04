import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { AppData, Project } from '../types';
import { ProjectViewer } from './ProjectViewer';
import { renameProjectFolder } from '../api';

export function ProjectRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, handleSave } = useOutletContext<{ data: AppData, handleSave: (d: AppData) => void }>();

  const project = data.projects.find(p => p.id === id);

  if (!project) {
    return <div className="p-8 text-neutral-500">Project not found.</div>;
  }

  const onUpdate = async (updatedProject: Project) => {
    const idChanged = updatedProject.id !== project.id;
    
    let finalProject = updatedProject;

    if (idChanged) {
      try {
        await renameProjectFolder(project.id, updatedProject.id);
        
        // Update image URLs to point to the new folder
        finalProject = {
          ...updatedProject,
          jobs: updatedProject.jobs.map(job => {
            if (job.imageUrl && job.imageUrl.includes(`/api/images/${project.id}/`)) {
              return {
                ...job,
                imageUrl: job.imageUrl.replace(`/api/images/${project.id}/`, `/api/images/${updatedProject.id}/`)
              };
            }
            return job;
          })
        };
      } catch (e) {
        console.error("Failed to rename project folder:", e);
        // If rename fails, we might want to revert the ID change, but for now just proceed
        // or we could show an error. Let's revert the ID change.
        alert("Failed to rename project folder. Reverting ID change.");
        finalProject = { ...updatedProject, id: project.id };
      }
    }
    
    handleSave({
      ...data,
      projects: data.projects.map(p => p.id === project.id ? finalProject : p)
    });

    if (idChanged && finalProject.id === updatedProject.id) {
      navigate(`/project/${finalProject.id}`, { replace: true });
    }
  };

  const onDelete = () => {
    handleSave({
      ...data,
      projects: data.projects.filter(p => p.id !== project.id)
    });
    navigate('/');
  };

  return <ProjectViewer project={project} libraries={data.libraries} onUpdate={onUpdate} onDelete={onDelete} />;
}
