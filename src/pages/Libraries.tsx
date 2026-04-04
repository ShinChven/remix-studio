import { useOutletContext, useNavigate } from 'react-router-dom';
import { AppData } from '../types';
import { Plus, Folder, LayoutGrid, Layers, ChevronRight } from 'lucide-react';

export function Libraries() {
  const { data, addLibrary } = useOutletContext<{ data: AppData, addLibrary: () => void }>();
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col p-8 overflow-y-auto">
      <div className="max-w-5xl w-full mx-auto space-y-8">
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2 font-display">Libraries</h2>
          <p className="text-neutral-400">Manage your reusable prompts and image collections.</p>
        </header>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-blue-500" />
              All Libraries
            </h3>
            <div className="flex gap-2">
              <button 
                onClick={addLibrary} 
                className="text-sm bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 px-4 py-2 rounded-lg transition-all flex items-center gap-2 border border-blue-600/30 font-medium"
              >
                <Plus className="w-4 h-4" /> New Library
              </button>
            </div>
          </div>
          
          <div className="space-y-3">
            {data.libraries.map(lib => (
              <button
                key={lib.id}
                onClick={() => navigate(`/library/${lib.id}`)}
                className="w-full bg-neutral-900/40 backdrop-blur-sm border border-neutral-800/60 hover:border-blue-500/40 hover:bg-neutral-900/60 p-4 rounded-xl text-left transition-all group flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-lg ${lib.type === 'image' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-blue-500/10 text-blue-500'} group-hover:scale-110 transition-transform`}>
                    {lib.type === 'image' ? <Layers className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-base">{lib.name}</h4>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-neutral-500 uppercase tracking-wider font-medium">{lib.type || 'text'} library</span>
                      <span className="text-neutral-700">•</span>
                      <span className="text-xs text-neutral-400">{lib.items?.length || 0} items</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">Open Editor →</span>
                  <ChevronRight className="w-4 h-4 text-neutral-600 group-hover:text-blue-500 transition-colors" />
                </div>
              </button>
            ))}
            
            {data.libraries.length === 0 && (
              <div className="col-span-full py-16 border-2 border-dashed border-neutral-800 rounded-3xl text-center text-neutral-500 flex flex-col items-center justify-center gap-4 bg-neutral-900/20">
                <Folder className="w-12 h-12 text-neutral-700" />
                <div>
                  <p className="text-lg font-medium text-neutral-400">No libraries yet</p>
                  <p className="text-sm">Create one to store reusable prompts or images.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
