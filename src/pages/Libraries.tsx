import { useOutletContext, useNavigate } from 'react-router-dom';
import { AppData } from '../types';
import { Plus, Folder, LayoutGrid, Layers, ChevronRight } from 'lucide-react';

export function Libraries() {
  const { data, addLibrary } = useOutletContext<{ data: AppData, addLibrary: () => void }>();
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8">
        <header className="mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 font-display">Libraries</h2>
          <p className="text-sm md:text-base text-neutral-400">Manage your reusable prompts and image collections.</p>
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
                className="text-xs md:text-sm bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 px-3 md:px-4 py-2 rounded-lg transition-all flex items-center gap-2 border border-blue-600/30 font-medium"
              >
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Library</span><span className="sm:hidden">New</span>
              </button>
            </div>
          </div>
          
          <div className="space-y-3">
            {data.libraries.map(lib => (
              <button
                key={lib.id}
                onClick={() => navigate(`/library/${lib.id}`)}
                className="w-full bg-neutral-900/40 backdrop-blur-sm border border-neutral-800/60 hover:border-blue-500/40 hover:bg-neutral-900/60 p-3 md:p-4 rounded-xl text-left transition-all group flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                  <div className={`flex-shrink-0 p-2 md:p-2.5 rounded-lg ${lib.type === 'image' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-blue-500/10 text-blue-500'} group-hover:scale-110 transition-transform`}>
                    {lib.type === 'image' ? <Layers className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="font-semibold text-white text-sm md:text-base truncate">{lib.name}</h4>
                    <div className="flex items-center gap-2 md:gap-3 mt-0.5 whitespace-nowrap overflow-hidden">
                      <span className="text-[10px] md:text-xs text-neutral-500 uppercase tracking-wider font-medium">{lib.type || 'text'}</span>
                      <span className="text-neutral-700">•</span>
                      <span className="text-[10px] md:text-xs text-neutral-400">{lib.items?.length || 0} items</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                  <span className="hidden sm:inline text-sm font-medium text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">Open Editor →</span>
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
