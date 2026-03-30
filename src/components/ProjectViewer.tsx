import React, { useState, useRef, useEffect } from 'react';
import { Project, Job, Library, WorkflowItem, WorkflowItemType } from '../types';
import { saveImage } from '../api';
import { GoogleGenAI } from '@google/genai';
import { Play, Square, AlertCircle, CheckCircle2, Loader2, Image as ImageIcon, Trash2, GripVertical, Type, Library as LibraryIcon, Plus, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { generateWorkflowCombinations } from '../lib/remixEngine';

interface Props {
  project: Project;
  libraries: Library[];
  onUpdate: (project: Project) => void;
  onDelete: () => void;
}

export function ProjectViewer({ project, libraries, onUpdate, onDelete }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const isProcessingRef = useRef(false);
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // Keep ref in sync with state for the async loop
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  const updateJob = (jobId: string, updates: Partial<Job>) => {
    const currentProject = projectRef.current;
    const updatedProject = {
      ...currentProject,
      jobs: currentProject.jobs.map(j => j.id === jobId ? { ...j, ...updates } : j)
    };
    projectRef.current = updatedProject; // Optimistically update the ref
    onUpdate(updatedProject);
  };

  const addWorkflowItem = (type: WorkflowItemType) => {
    const newItem: WorkflowItem = {
      id: crypto.randomUUID(),
      type,
      value: type === 'library' && libraries.length > 0 ? libraries[0].id : ''
    };
    onUpdate({ ...project, workflow: [...(project.workflow || []), newItem] });
  };

  const updateWorkflowItem = (id: string, value: string) => {
    const newWorkflow = project.workflow.map(item => 
      item.id === id ? { ...item, value } : item
    );
    onUpdate({ ...project, workflow: newWorkflow });
  };

  const removeWorkflowItem = (id: string) => {
    onUpdate({ ...project, workflow: project.workflow.filter(item => item.id !== id) });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newWorkflow = [...(project.workflow || [])];
    const [draggedItem] = newWorkflow.splice(draggedIndex, 1);
    newWorkflow.splice(dropIndex, 0, draggedItem);
    
    onUpdate({ ...project, workflow: newWorkflow });
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        updateWorkflowItem(id, e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generateAndStart = () => {
    const combinations = generateWorkflowCombinations(project.workflow || [], libraries);
    if (combinations.length === 0) return;

    const newJobs: Job[] = combinations.map(combo => ({
      id: crypto.randomUUID(),
      prompt: combo.prompt,
      imageContext: combo.imageContext,
      status: 'pending'
    }));

    const updatedProject = { ...project, jobs: [...project.jobs, ...newJobs] };
    onUpdate(updatedProject);
    projectRef.current = updatedProject;
    
    setIsProcessing(true);
    processQueue();
  };

  const processQueue = async () => {
    const pendingJobs = projectRef.current.jobs.filter(j => j.status === 'pending' || j.status === 'failed');
    
    for (const job of pendingJobs) {
      if (!isProcessingRef.current) break;
      
      try {
        updateJob(job.id, { status: 'processing', error: undefined });
        
        // @ts-ignore
        const apiKey = process.env.API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
        const ai = new GoogleGenAI({ apiKey });
        
        const parts: any[] = [{ text: job.prompt }];
        
        if (job.imageContext) {
          const match = job.imageContext.match(/^data:(image\/\w+);base64,(.*)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2]
              }
            });
          }
        }

        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image-preview',
          contents: { parts },
          config: {
            // @ts-ignore
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "1K"
            }
          }
        });

        let base64Image = '';
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            base64Image = part.inlineData.data;
            break;
          }
        }

        if (base64Image) {
          const url = await saveImage(base64Image, project.id);
          updateJob(job.id, { status: 'completed', imageUrl: url });
        } else {
          throw new Error("No image generated by the model");
        }
      } catch (error: any) {
        console.error("Job failed:", error);
        updateJob(job.id, { status: 'failed', error: error.message || 'Unknown error' });
      }
      
      // Small delay between requests to avoid hitting rate limits too hard
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setIsProcessing(false);
  };

  const toggleProcessing = () => {
    if (isProcessing) {
      setIsProcessing(false);
    } else {
      const pendingJobs = project.jobs.filter(j => j.status === 'pending');
      if (pendingJobs.length > 0) {
        setIsProcessing(true);
        processQueue();
      } else {
        generateAndStart();
      }
    }
  };

  const activeTasks = project.jobs.filter(j => j.status === 'pending' || j.status === 'processing');
  const completedTasks = project.jobs.filter(j => j.status === 'completed');
  const failedTasks = project.jobs.filter(j => j.status === 'failed');
  const total = project.jobs.length;
  const progress = total === 0 ? 0 : Math.round((completedTasks.length + failedTasks.length) / total * 100);

  const combinations = generateWorkflowCombinations(project.workflow || [], libraries);

  const displayTasks = activeTasks.length > 0 
    ? activeTasks 
    : combinations.map((c, i) => ({ id: `preview-${i}`, prompt: c.prompt, imageContext: c.imageContext, status: 'preview' as const }));

  const [localId, setLocalId] = useState(project.id);

  useEffect(() => {
    setLocalId(project.id);
  }, [project.id]);

  const handleIdCommit = () => {
    const newId = localId.trim().replace(/[^a-zA-Z0-9-_]/g, '_');
    if (newId && newId !== project.id) {
      onUpdate({ ...project, id: newId });
    } else {
      setLocalId(project.id); // Revert if empty
    }
  };

  return (
    <div className="flex h-full bg-neutral-950">
      {/* Left Pane: Workflow Builder */}
      <div className="w-96 border-r border-neutral-800 bg-neutral-900/30 flex flex-col">
        <div className="p-4 border-b border-neutral-800 flex flex-col gap-2">
          <input
            type="text"
            value={project.name}
            onChange={(e) => onUpdate({ ...project, name: e.target.value })}
            placeholder="Project Name"
            className="bg-transparent text-xl font-bold text-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 w-full"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 font-mono">Project ID:</span>
            <input
              type="text"
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              onBlur={handleIdCommit}
              onKeyDown={(e) => e.key === 'Enter' && handleIdCommit()}
              placeholder="project-id"
              className="bg-neutral-950 text-xs font-mono text-neutral-400 border border-neutral-800 focus:border-blue-500 focus:outline-none rounded px-2 py-1 flex-1"
            />
            <button onClick={onDelete} className="text-neutral-500 hover:text-red-400 p-1" title="Delete Project">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-neutral-800 flex gap-2">
          <button onClick={() => addWorkflowItem('text')} className="flex-1 flex items-center justify-center gap-1 bg-neutral-800 hover:bg-neutral-700 text-xs py-2 rounded text-neutral-300">
            <Type className="w-3 h-3" /> Text
          </button>
          <button onClick={() => addWorkflowItem('library')} className="flex-1 flex items-center justify-center gap-1 bg-neutral-800 hover:bg-neutral-700 text-xs py-2 rounded text-neutral-300">
            <LibraryIcon className="w-3 h-3" /> Library
          </button>
          <button onClick={() => addWorkflowItem('image')} className="flex-1 flex items-center justify-center gap-1 bg-neutral-800 hover:bg-neutral-700 text-xs py-2 rounded text-neutral-300">
            <ImageIcon className="w-3 h-3" /> Image
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {(project.workflow || []).map((item, index) => (
            <div 
              key={item.id} 
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`bg-neutral-800/50 border rounded-lg p-3 group transition-all ${
                draggedIndex === index ? 'opacity-50 border-blue-500' : 
                dragOverIndex === index ? 'border-blue-400 border-dashed bg-neutral-800' : 
                'border-neutral-700'
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <div className="cursor-grab active:cursor-grabbing text-neutral-500 hover:text-white">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-neutral-400 uppercase flex items-center gap-1">
                    {item.type === 'text' && <Type className="w-3 h-3" />}
                    {item.type === 'library' && <LibraryIcon className="w-3 h-3" />}
                    {item.type === 'image' && <ImageIcon className="w-3 h-3" />}
                    {item.type}
                  </span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => removeWorkflowItem(item.id)} className="text-neutral-500 hover:text-red-400 ml-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {item.type === 'text' && (
                <textarea
                  value={item.value}
                  onChange={(e) => updateWorkflowItem(item.id, e.target.value)}
                  placeholder="Enter prompt text..."
                  className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none h-20"
                />
              )}

              {item.type === 'library' && (
                <select
                  value={item.value}
                  onChange={(e) => updateWorkflowItem(item.id, e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="" disabled>Select a library</option>
                  {libraries.map(lib => (
                    <option key={lib.id} value={lib.id}>{lib.name} ({lib.type || 'text'}, {lib.items.length} items)</option>
                  ))}
                </select>
              )}

              {item.type === 'image' && (
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, item.id)}
                    className="w-full text-sm text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600/20 file:text-blue-400 hover:file:bg-blue-600/30"
                  />
                  {item.value && (
                    <img src={item.value} alt="Reference" className="w-full h-32 object-cover rounded border border-neutral-700" />
                  )}
                </div>
              )}
            </div>
          ))}
          
          {(project.workflow || []).length === 0 && (
            <div className="text-center text-neutral-500 text-sm py-8">
              Add items above to build your prompt workflow.
            </div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-800 bg-neutral-900">
          <div className="flex justify-between text-sm mb-3">
            <span className="text-neutral-400">Tasks:</span>
            <span className="text-white font-mono">{combinations.length}</span>
          </div>
          <button
            onClick={toggleProcessing}
            disabled={combinations.length === 0 && !isProcessing && activeTasks.length === 0}
            className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
              isProcessing 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {isProcessing ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {isProcessing ? 'Stop Processing' : 'Start'}
          </button>
        </div>
      </div>

      {/* Right Pane: Jobs Grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">
          <div>
            <h2 className="text-lg font-semibold text-white">Project Status</h2>
            <div className="flex items-center gap-4 text-sm text-neutral-400 mt-1">
              <span>{completedTasks.length} / {total} completed</span>
              {failedTasks.length > 0 && <span className="text-red-400">{failedTasks.length} failed</span>}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {total > 0 && (
              <div className="w-48 h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Tasks Section */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4">Tasks</h3>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
              <div className="max-h-60 overflow-y-auto p-2 space-y-2">
                {displayTasks.map(task => (
                  <div key={task.id} className="bg-neutral-950 p-3 rounded border border-neutral-800 flex justify-between items-center">
                    <span className="text-sm text-neutral-300 line-clamp-1" title={task.prompt}>{task.prompt}</span>
                    <div className="ml-4 flex-shrink-0">
                      {task.status === 'processing' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                      {task.status === 'pending' && <span className="text-xs text-neutral-500 font-medium px-2 py-1 bg-neutral-800 rounded">Pending</span>}
                      {task.status === 'preview' && <span className="text-xs text-neutral-500 font-medium px-2 py-1 bg-neutral-800 rounded">Preview</span>}
                    </div>
                  </div>
                ))}
                {displayTasks.length === 0 && (
                  <div className="p-4 text-center text-neutral-500 text-sm">No tasks available. Build your workflow on the left.</div>
                )}
              </div>
            </div>
          </section>

          {/* Album Section */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-baseline gap-2">
              Album 
              <span className="text-sm font-normal text-neutral-500">Cumulative Generated Results</span>
            </h3>
            
            {completedTasks.length === 0 ? (
              <div className="bg-neutral-900/50 border border-neutral-800 border-dashed rounded-lg p-8 text-center text-neutral-500">
                <ImageIcon className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p>No images in album yet. Start tasks to generate results.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {completedTasks.map(job => (
                  <div key={job.id} className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden flex flex-col group">
                    <div className="aspect-square bg-neutral-950 relative flex items-center justify-center">
                      <img src={job.imageUrl} alt={job.prompt} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <CheckCircle2 className="w-5 h-5 text-green-500 drop-shadow-md" />
                      </div>
                    </div>
                    <div className="p-3 text-xs text-neutral-400 line-clamp-2 flex-1 border-t border-neutral-800" title={job.prompt}>
                      {job.prompt}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Errors Section */}
          {failedTasks.length > 0 && (
            <section>
              <button 
                onClick={() => setShowErrors(!showErrors)} 
                className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors font-medium mb-4"
              >
                {showErrors ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                Errors ({failedTasks.length})
              </button>
              
              {showErrors && (
                <div className="grid grid-cols-1 gap-2">
                  {failedTasks.map(job => (
                    <div key={job.id} className="bg-red-950/20 border border-red-900/30 p-4 rounded-lg flex flex-col gap-2">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-neutral-300 mb-1">{job.prompt}</p>
                          <p className="text-xs text-red-400 font-mono bg-red-950/50 p-2 rounded">{job.error}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
