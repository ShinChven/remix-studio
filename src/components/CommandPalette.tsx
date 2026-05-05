import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { Search, Folder, Play, Send, Plus, Loader2, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { fetchProjects, fetchLibraries, fetchCampaigns, createProject, createLibrary, createCampaign } from '../api';

export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  
  const [projects, setProjects] = useState<any[]>([]);
  const [libraries, setLibraries] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    
    const handleOpenEvent = () => setOpen(true);

    document.addEventListener('keydown', down);
    window.addEventListener('open-command-palette', handleOpenEvent);
    
    return () => {
      document.removeEventListener('keydown', down);
      window.removeEventListener('open-command-palette', handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setInputValue('');
      setDebouncedQuery('');
      return;
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(inputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const isDebouncedCommandMode = debouncedQuery.trim().startsWith('>');

  useEffect(() => {
    if (!open) return;
    if (isDebouncedCommandMode) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const query = debouncedQuery.trim();
        const limit = query ? 20 : 10;
        
        const [projectsRes, librariesRes, campaignsRes] = await Promise.all([
          fetchProjects(1, limit, query),
          fetchLibraries(1, limit, query),
          fetchCampaigns() // backend does not support query yet, we will filter locally
        ]);
        setProjects(projectsRes.items || []);
        setLibraries(librariesRes.items || []);
        
        const allCampaigns = campaignsRes || [];
        setCampaigns(query 
          ? allCampaigns.filter((c: any) => c.name?.toLowerCase().includes(query.toLowerCase())) 
          : allCampaigns.slice(0, 10));
      } catch (err) {
        console.error('Failed to load command palette data', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [open, debouncedQuery, isDebouncedCommandMode]);

  const isCommandMode = inputValue.trim().startsWith('>');
  const commandQuery = isCommandMode ? inputValue.trim().substring(1).trim().toLowerCase() : '';

  // Parse exact command creation strings
  const createMatch = useMemo(() => {
    if (!isCommandMode) return null;
    
    const match = commandQuery.match(/^create\s+(?:(text|image|video|audio)\s+(project|library)|(campaign))\s+(.+)$/i);
    
    if (match) {
      const subTypeRaw = match[1]?.toLowerCase();
      const projectOrLibrary = match[2]?.toLowerCase();
      const campaign = match[3]?.toLowerCase();
      const name = match[4].trim();
      
      if (campaign) {
        return { type: 'campaign', subType: 'image', name };
      } else if (projectOrLibrary && subTypeRaw) {
        return { type: projectOrLibrary, subType: subTypeRaw, name };
      }
    }
    return null;
  }, [isCommandMode, commandQuery]);

  const handleCreate = async () => {
    if (!createMatch) return;
    const { type, subType, name } = createMatch;
    
    setLoading(true);
    try {
      if (type === 'library') {
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        await createLibrary({ id: id || Date.now().toString(), name, type: subType });
        toast.success(`Library "${name}" created`);
        navigate(`/library/${id}`);
      } else if (type === 'project') {
        const id = Date.now().toString();
        await createProject({ 
          id, 
          name, 
          type: subType as any, 
          createdAt: Date.now(), 
          workflow: [], 
          jobs: [], 
          album: [] 
        });
        toast.success(`Project "${name}" created`);
        navigate(`/project/${id}`);
      } else if (type === 'campaign') {
        const campaign = await createCampaign({ name });
        toast.success(`Campaign "${name}" created`);
        if (campaign && campaign.id) {
          navigate(`/campaigns/${campaign.id}`);
        } else {
          navigate(`/campaigns`);
        }
      }
      setOpen(false);
    } catch (err: any) {
      toast.error(`Failed to create ${type}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const availableCommands = [
    { id: 'cmd-text-proj', title: 'Create text project...', prefix: '> create text project ' },
    { id: 'cmd-img-proj', title: 'Create image project...', prefix: '> create image project ' },
    { id: 'cmd-vid-proj', title: 'Create video project...', prefix: '> create video project ' },
    { id: 'cmd-aud-proj', title: 'Create audio project...', prefix: '> create audio project ' },
    { id: 'cmd-text-lib', title: 'Create text library...', prefix: '> create text library ' },
    { id: 'cmd-img-lib', title: 'Create image library...', prefix: '> create image library ' },
    { id: 'cmd-vid-lib', title: 'Create video library...', prefix: '> create video library ' },
    { id: 'cmd-aud-lib', title: 'Create audio library...', prefix: '> create audio library ' },
    { id: 'cmd-camp', title: 'Create campaign...', prefix: '> create campaign ' },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={() => setOpen(false)} 
      />
      <Command 
        className="relative w-full max-w-xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-white/10 overflow-hidden flex flex-col"
        shouldFilter={false}
        loop
      >
        <div className="flex items-center px-4 border-b border-neutral-200 dark:border-white/10">
          <Search className="w-5 h-5 text-neutral-500" />
          <Command.Input 
            autoFocus
            value={inputValue}
            onValueChange={setInputValue}
            placeholder="Type to search, or type > for commands..." 
            className="flex-1 px-4 py-4 bg-transparent outline-none text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500"
          />
          {loading && <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />}
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-neutral-500 [&_[cmdk-group-heading]]:dark:text-neutral-400 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-4">
          <Command.Empty className="py-6 text-center text-sm text-neutral-500">
            No results found.
          </Command.Empty>

          {isCommandMode && (
            <Command.Group heading="Commands">
              {/* Show the available commands hints if they haven't typed a complete match yet */}
              {!createMatch && availableCommands
                .filter(cmd => cmd.prefix.toLowerCase().includes(inputValue.toLowerCase()) || cmd.title.toLowerCase().includes(inputValue.toLowerCase().replace(/^>\s*/, '')))
                .map(cmd => (
                <Command.Item
                  key={cmd.id}
                  value={cmd.prefix}
                  onSelect={() => setInputValue(cmd.prefix)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer text-sm aria-selected:bg-neutral-100 dark:aria-selected:bg-white/5 text-neutral-700 dark:text-neutral-300"
                >
                  <Terminal className="w-4 h-4 text-neutral-500" />
                  {cmd.title}
                </Command.Item>
              ))}

              {/* Show the execution button when they have fully typed the command and name */}
              {createMatch && (
                <Command.Item
                  value={inputValue} // This ensures cmdk always matches and displays this item
                  onSelect={handleCreate}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer text-sm font-medium bg-indigo-50/50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 aria-selected:bg-indigo-100 dark:aria-selected:bg-indigo-900/40"
                >
                  <Plus className="w-4 h-4" />
                  Execute: Create {createMatch.subType !== 'image' ? createMatch.subType + ' ' : ''}{createMatch.type} "{createMatch.name}"
                </Command.Item>
              )}
            </Command.Group>
          )}

          {!isCommandMode && projects.length > 0 && (
            <Command.Group heading="Projects">
              {projects.map(p => (
                <Command.Item 
                  key={p.id}
                  value={`project ${p.name}`}
                  onSelect={() => {
                    navigate(`/project/${p.id}`);
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer text-sm aria-selected:bg-neutral-100 dark:aria-selected:bg-white/5 text-neutral-700 dark:text-neutral-300"
                >
                  <Play className="w-4 h-4 text-neutral-500" />
                  {p.name}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {!isCommandMode && libraries.length > 0 && (
            <Command.Group heading="Libraries">
              {libraries.map(l => (
                <Command.Item 
                  key={l.id}
                  value={`library ${l.name}`}
                  onSelect={() => {
                    navigate(`/library/${l.id}`);
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer text-sm aria-selected:bg-neutral-100 dark:aria-selected:bg-white/5 text-neutral-700 dark:text-neutral-300"
                >
                  <Folder className="w-4 h-4 text-neutral-500" />
                  {l.name}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {!isCommandMode && campaigns.length > 0 && (
            <Command.Group heading="Campaigns">
              {campaigns.map(c => (
                <Command.Item 
                  key={c.id}
                  value={`campaign ${c.name}`}
                  onSelect={() => {
                    navigate(`/campaigns/${c.id}`);
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer text-sm aria-selected:bg-neutral-100 dark:aria-selected:bg-white/5 text-neutral-700 dark:text-neutral-300"
                >
                  <Send className="w-4 h-4 text-neutral-500" />
                  {c.name}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
