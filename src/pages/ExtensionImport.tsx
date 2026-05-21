import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { fetchLibraries, fetchProjects, fetchProject, updateProject, createLibraryItem, saveImage, createLibrary, createProject } from '../api';
import { Library, Project } from '../types';
import { useTranslation } from 'react-i18next';
import { Save, Folder, Layers, Image as ImageIcon, Type, ArrowRight, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type ImportData = {
  type: 'image' | 'text';
  data: string; // base64 for image, plain string for text
  name?: string;
};

import { PageHeader } from '../components/PageHeader';
import { consumePwaShareHandoff } from '../lib/pwa-share';

function Modal({ isOpen, onClose, title, children }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200/50 dark:border-white/10 backdrop-blur-2xl rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-neutral-200/50 dark:border-white/10 flex justify-between items-center bg-neutral-50/50 dark:bg-neutral-900/50">
          <h3 className="text-base font-bold text-neutral-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function CreateLibraryModal({ isOpen, onClose, type, onSuccess }: { isOpen: boolean, onClose: () => void, type: 'image' | 'text', onSuccess: (id: string, name: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const id = crypto.randomUUID();
      await createLibrary({ id, name: name.trim(), description: description.trim() || undefined, type });
      toast.success('Library created successfully');
      onSuccess(id, name.trim());
      onClose();
      setName('');
      setDescription('');
    } catch (err) {
      toast.error('Failed to create library');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Library">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Name</label>
          <input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Inspiration" className="w-full rounded-xl border border-neutral-200 dark:border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-neutral-950 dark:text-white" />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Description (Optional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What goes in this library?" className="w-full rounded-xl border border-neutral-200 dark:border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-neutral-950 dark:text-white" rows={3} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors">Cancel</button>
          <button type="submit" disabled={isSubmitting || !name.trim()} className="px-4 py-2 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">Create Library</button>
        </div>
      </form>
    </Modal>
  );
}

function CreateProjectModal({ isOpen, onClose, type, onSuccess }: { isOpen: boolean, onClose: () => void, type: 'image' | 'text', onSuccess: (id: string, name: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prefix, setPrefix] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const id = `project-${Date.now()}`;
      await createProject({ 
        id, 
        name: name.trim(), 
        description: description.trim() || undefined, 
        type,
        prefix: prefix.trim(),
        createdAt: Date.now(),
        workflow: [],
        jobs: [],
        album: [],
        shuffle: false
      });
      toast.success('Project created successfully');
      onSuccess(id, name.trim());
      onClose();
      setName('');
      setDescription('');
      setPrefix('');
    } catch (err) {
      toast.error('Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Project">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Name</label>
          <input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Logo Generator" className="w-full rounded-xl border border-neutral-200 dark:border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-neutral-950 dark:text-white" />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Description (Optional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-xl border border-neutral-200 dark:border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-neutral-950 dark:text-white" rows={2} />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Prefix (Optional)</label>
          <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g. img_" className="w-full rounded-xl border border-neutral-200 dark:border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-neutral-950 dark:text-white" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors">Cancel</button>
          <button type="submit" disabled={isSubmitting || !name.trim()} className="px-4 py-2 text-sm font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">Create Project</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ExtensionImport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [importData, setImportData] = useState<ImportData | null>(null);
  
  const [destinationType, setDestinationType] = useState<'library' | 'project'>('library');

  const handleDestinationChange = (type: 'library' | 'project') => {
    setDestinationType(type);
    if (importData?.type) {
      localStorage.setItem(`remix_studio_import_destination_${importData.type}`, type);
    }
  };

  const [itemName, setItemName] = useState('');
  
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingDestinations, setLoadingDestinations] = useState(false);
  
  const [selectedId, setSelectedId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const handleIdChange = (id: string) => {
    setSelectedId(id);
    if (importData?.type) {
      localStorage.setItem(`remix_studio_import_selected_id_${importData.type}_${destinationType}`, id);
    }
  };

  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [hasTimeout, setHasTimeout] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHasTimeout(true), 1500);

    const applyPayload = (payload: ImportData) => {
      setImportData(payload);

      if (payload?.type) {
        const saved = localStorage.getItem(`remix_studio_import_destination_${payload.type}`);
        if (saved === 'project' || saved === 'library') {
          setDestinationType(saved);
        }
      }

      if (payload.name) {
        setItemName(payload.name);
      }
      clearTimeout(timer);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'REMIX_STUDIO_EXTENSION_IMPORT') {
        const payload = event.data.payload;
        applyPayload(payload);
        // Acknowledge receipt so the extension stops sending and clears storage
        window.postMessage({ type: 'REMIX_STUDIO_EXTENSION_ACK' }, '*');
      }
    };

    window.addEventListener('message', handleMessage);

    const shared = consumePwaShareHandoff();
    if (shared) {
      applyPayload({ type: shared.type, data: shared.data, name: shared.name });
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!importData) return;

    const loadDestinations = async () => {
      setLoadingDestinations(true);
      try {
        if (destinationType === 'library') {
          const res = await fetchLibraries(1, 100, undefined, false, true);
          // Filter out libraries that don't match the import type
          const filtered = res.items.filter(lib => lib.type === importData.type);
          setLibraries(filtered);
          const savedId = localStorage.getItem(`remix_studio_import_selected_id_${importData.type}_${destinationType}`);
          if (savedId && filtered.find(l => l.id === savedId)) {
            setSelectedId(savedId);
          } else if (filtered.length > 0) {
            setSelectedId(filtered[0].id);
          } else {
            setSelectedId('');
          }
        } else {
          const res = await fetchProjects(1, 100, undefined, 'active', true);
          const filtered = res.items.filter(proj => proj.type === importData.type);
          setProjects(filtered);
          const savedId = localStorage.getItem(`remix_studio_import_selected_id_${importData.type}_${destinationType}`);
          if (savedId && filtered.find(p => p.id === savedId)) {
            setSelectedId(savedId);
          } else if (filtered.length > 0) {
            setSelectedId(filtered[0].id);
          } else {
            setSelectedId('');
          }
        }
      } catch (e) {
        console.error('Failed to load destinations', e);
        toast.error('Failed to load destinations');
      } finally {
        setLoadingDestinations(false);
      }
    };

    loadDestinations();
  }, [destinationType, importData]);

  const handleSave = async () => {
    if (!importData || !selectedId) return;
    
    setIsSaving(true);
    try {
      if (destinationType === 'library') {
        let content = importData.data;
        let thumbnailUrl = undefined;
        let optimizedUrl = undefined;
        let size = undefined;

        if (importData.type === 'image') {
          const result = await saveImage(importData.data, selectedId);
          content = result.key;
          thumbnailUrl = result.thumbnailKey;
          optimizedUrl = result.optimizedKey;
          size = result.size;
        }

        await createLibraryItem(selectedId, {
          id: window.crypto.randomUUID(),
          content,
          thumbnailUrl,
          optimizedUrl,
          size,
          title: itemName.trim() || `Imported ${importData.type}`,
        });
        
        toast.success(`Saved to library successfully!`);
        navigate(`/library/${selectedId}`);
      } else {
        const project = await fetchProject(selectedId);
        
        let value = importData.data;
        let thumbnailUrl = undefined;
        let optimizedUrl = undefined;
        let size = undefined;

        if (importData.type === 'image') {
          const result = await saveImage(importData.data, selectedId);
          value = result.key;
          thumbnailUrl = result.thumbnailKey;
          optimizedUrl = result.optimizedKey;
          size = result.size;
        }

        const newItem = {
          id: window.crypto.randomUUID(),
          type: importData.type,
          value,
          thumbnailUrl,
          optimizedUrl,
          size,
          order: project.workflow.length,
        };

        await updateProject(selectedId, {
          workflow: [...project.workflow, newItem],
        });
        
        toast.success(`Saved to project successfully!`);
        navigate(`/project/${selectedId}`);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Failed to save imported item');
    } finally {
      setIsSaving(false);
    }
  };

  if (!importData) {
    if (hasTimeout) {
      return (
        <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto items-center justify-center min-h-[60vh] text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center dark:bg-neutral-800">
             <ImageIcon className="w-8 h-8 text-neutral-400" />
          </div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white">No Import Data Found</h2>
          <p className="text-neutral-500 dark:text-neutral-400 max-w-md text-sm">
            Please use the Remix Studio Chrome extension to right-click an image or selected text and choose "Send to Remix Studio".
          </p>
          <button onClick={() => navigate('/')} className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl shadow hover:bg-blue-700 transition-all mt-4">
            Go to Home
          </button>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto items-center justify-center min-h-[60vh] text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-neutral-500 dark:text-neutral-400 font-medium text-sm">Waiting for data from extension...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <PageHeader
          title={`Import ${importData.type === 'image' ? 'Image' : 'Text'}`}
          description="Save this item to your Remix Studio workspace."
          backLink={{ label: 'Cancel', onClick: () => navigate(-1) }}
        />

      <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Preview Section */}
        <div className="space-y-6 rounded-lg border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/55 md:p-6">
          <section className="space-y-2">
            <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
              <Type className="h-3.5 w-3.5" />
              Name
            </label>
            <input
              type="text"
              autoFocus
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder={`Name this imported ${importData.type}`}
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-base font-semibold text-neutral-950 shadow-sm transition-all placeholder:text-neutral-400 focus:border-blue-500/60 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-600"
            />
          </section>

          <section className="space-y-2">
            <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
              {importData.type === 'image' ? <ImageIcon className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
              Preview
            </label>
            <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-neutral-950">
              {importData.type === 'image' ? (
                <img src={importData.data} alt="Import preview" className="max-h-[400px] max-w-full rounded-lg object-contain" />
              ) : (
                <div className="h-full max-h-[400px] w-full overflow-auto whitespace-pre-wrap rounded-lg bg-white p-4 font-mono text-sm dark:bg-neutral-900">
                  {importData.data}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Destination Section */}
        <aside className="space-y-6">
          <div className="rounded-lg border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/55">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-lg bg-neutral-100 p-2 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                <Folder className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-neutral-950 dark:text-white">Destination</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">Choose where to save.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleDestinationChange('library')}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-[11px] font-black uppercase tracking-wider transition-all ${
                    destinationType === 'library'
                      ? 'border-blue-500/60 bg-blue-500/10 text-blue-600 shadow-blue-500/10 dark:text-blue-300'
                      : 'border-neutral-200/70 bg-white/60 text-neutral-600 hover:border-neutral-300 hover:bg-white dark:border-white/10 dark:bg-neutral-900/50 dark:text-neutral-400 dark:hover:border-white/20 dark:hover:bg-neutral-900'
                  }`}
                >
                  <Layers className={`h-4 w-4 ${destinationType === 'library' ? 'text-blue-500 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-500'}`} />
                  Library
                </button>
                <button
                  type="button"
                  onClick={() => handleDestinationChange('project')}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-[11px] font-black uppercase tracking-wider transition-all ${
                    destinationType === 'project'
                      ? 'border-blue-500/60 bg-blue-500/10 text-blue-600 shadow-blue-500/10 dark:text-blue-300'
                      : 'border-neutral-200/70 bg-white/60 text-neutral-600 hover:border-neutral-300 hover:bg-white dark:border-white/10 dark:bg-neutral-900/50 dark:text-neutral-400 dark:hover:border-white/20 dark:hover:bg-neutral-900'
                  }`}
                >
                  <Folder className={`h-4 w-4 ${destinationType === 'project' ? 'text-blue-500 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-500'}`} />
                  Project
                </button>
              </div>

              {loadingDestinations ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border border-neutral-200/70 bg-neutral-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                      Select {destinationType}
                    </label>
                    <button 
                      type="button"
                      onClick={() => destinationType === 'library' ? setShowLibraryModal(true) : setShowProjectModal(true)}
                      className="text-[11px] font-bold text-blue-500 hover:text-blue-600 transition-colors"
                    >
                      + Create New
                    </button>
                  </div>
                  
                  {(destinationType === 'library' ? libraries : projects).length === 0 ? (
                    <div className="flex flex-col items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
                      <p className="text-xs">No compatible {destinationType === 'library' ? 'libraries' : 'projects'} found.</p>
                    </div>
                  ) : (
                    <select
                      value={selectedId}
                      onChange={(e) => handleIdChange(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-950 shadow-sm transition-all focus:border-blue-500/60 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
                    >
                      <option value="" disabled>Choose a destination...</option>
                      {(destinationType === 'library' ? libraries : projects).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate(-1)}
              disabled={isSaving}
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.98] disabled:opacity-40 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !selectedId}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/15 transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </aside>
      </div>
      </div>
      <CreateLibraryModal 
        isOpen={showLibraryModal} 
        onClose={() => setShowLibraryModal(false)} 
        type={importData.type}
        onSuccess={(id, name) => {
          setLibraries(prev => [{ id, name, description: '', type: importData.type, items: [], createdAt: Date.now() }, ...prev]);
          handleIdChange(id);
        }}
      />
      <CreateProjectModal 
        isOpen={showProjectModal} 
        onClose={() => setShowProjectModal(false)} 
        type={importData.type}
        onSuccess={(id, name) => {
          setProjects(prev => [{ id, name, description: '', type: importData.type, workflow: [], jobs: [], album: [], createdAt: Date.now(), prefix: '', shuffle: false }, ...prev]);
          handleIdChange(id);
        }}
      />
    </div>
  );
}
