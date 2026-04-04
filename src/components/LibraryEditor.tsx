import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library } from '../types';
import { Trash2, Plus, GripVertical, Image as ImageIcon, CheckCircle2, Edit3, Settings, ChevronRight, Maximize2 } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

interface Props {
  library: Library;
  onUpdate: (lib: Library) => void;
  onDelete: () => void;
}

export function LibraryEditor({ library, onUpdate, onDelete }: Props) {
  const navigate = useNavigate();
  const [showDeleteLibraryModal, setShowDeleteLibraryModal] = useState(false);
  const [itemToRemoveIndex, setItemToRemoveIndex] = useState<number | null>(null);

  const handleRemoveItem = (index: number) => {
    setItemToRemoveIndex(index);
  };

  const confirmRemoveItem = () => {
    if (itemToRemoveIndex !== null) {
      const newItems = [...library.items];
      newItems.splice(itemToRemoveIndex, 1);
      onUpdate({ ...library, items: newItems });
      setItemToRemoveIndex(null);
    }
  };

  const handleItemSave = (index: number, value: string) => {
    const newItems = [...library.items];
    newItems[index] = value;
    onUpdate({ ...library, items: newItems });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const newItems = [...library.items];
    let loadedCount = 0;

    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          newItems.push(e.target.result as string);
        }
        loadedCount++;
        if (loadedCount === files.length) {
          onUpdate({ ...library, items: newItems });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="h-full flex flex-col px-10 py-12 max-w-6xl mx-auto overflow-hidden animate-in fade-in duration-700">
      <div className="flex items-center justify-between mb-12 flex-shrink-0">
        <div className="flex-1">
          <div className="flex items-center gap-3">
             <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
             <h2 className="text-4xl font-black text-white tracking-tight">{library.name}</h2>
          </div>
          
          <div className="flex items-center gap-4 mt-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 px-2.5 py-1 bg-neutral-900/50 border border-neutral-800 rounded-lg backdrop-blur-sm">
              {library.type || 'text'} Collection
            </div>
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Synced
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {library.type === 'image' ? (
            <label className="flex items-center gap-2 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white px-4 py-2.5 rounded-xl cursor-pointer transition-all border border-blue-600/20 hover:border-blue-600 active:scale-95 group shadow-sm">
              <ImageIcon className="w-4 h-4 transition-transform group-hover:scale-110" />
              <span className="text-xs font-bold uppercase tracking-widest">Upload</span>
              <input type="file" className="hidden" multiple accept="image/*" onChange={handleImageUpload} />
            </label>
          ) : (
            <button
              onClick={() => navigate(`/library/${library.id}/prompt/new`)}
              className="flex items-center gap-2 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white px-4 py-2.5 rounded-xl transition-all border border-blue-600/20 hover:border-blue-600 active:scale-95 group shadow-sm"
            >
              <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
              <span className="text-xs font-bold uppercase tracking-widest">Add Fragment</span>
            </button>
          )}

          <button 
            onClick={() => navigate(`/library/${library.id}/edit`)}
            className="p-2.5 text-neutral-400 hover:text-white hover:bg-neutral-800/80 rounded-xl transition-all border border-neutral-800/50 hover:border-neutral-700 active:scale-95"
            title="Edit Library Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          <button 
            onClick={() => setShowDeleteLibraryModal(true)}
            className="p-2.5 text-neutral-400 hover:text-red-500 hover:bg-red-400/10 rounded-xl transition-all border border-neutral-800/50 hover:border-red-400/20 active:scale-95"
            title="Delete Library"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-4 -mr-4 custom-scrollbar space-y-10">
        <div className={library.type === 'image' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8" : "space-y-4"}>
          {library.items.map((item, index) => (
            <div key={index} className="group relative">
                <div className={`group/item bg-neutral-900/40 border border-neutral-800/60 rounded-3xl transition-all duration-300 hover:bg-neutral-800/40 hover:border-neutral-700/80 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${library.type === 'image' ? 'aspect-square flex flex-col p-2 overflow-hidden' : 'p-6 flex items-center justify-between gap-6'}`}>
                  {library.type === 'image' ? (
                    <div className="relative flex-1 rounded-2xl overflow-hidden">
                      <img src={item} alt={`${index}`} className="w-full h-full object-cover transition-transform duration-1000 group-hover/item:scale-110" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-4">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">IMG_{index + 1}</span>
                          <div className="flex items-center gap-2">
                             <button 
                               onClick={() => handleRemoveItem(index)} 
                               className="p-2.5 bg-neutral-950/80 text-neutral-400 hover:text-red-500 rounded-xl backdrop-blur-md border border-white/5 hover:border-red-500/20 transition-all active:scale-90"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-5 flex-1">
                        <div className="text-neutral-700 p-1 flex-shrink-0 mt-1">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <p className="text-neutral-300 leading-relaxed text-sm font-medium tracking-wide">{item}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button 
                          onClick={() => navigate(`/library/${library.id}/prompt/${index}`)}
                          className="p-3 text-neutral-500 hover:text-white hover:bg-neutral-800/80 rounded-2xl transition-all border border-transparent hover:border-neutral-700 active:scale-95 shadow-sm"
                          title="Refine in Full Editor"
                        >
                          <Edit3 className="w-4.5 h-4.5" />
                        </button>
                        <button 
                          onClick={() => handleRemoveItem(index)}
                          className="p-3 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all border border-transparent hover:border-red-500/20 active:scale-95 shadow-sm"
                          title="Delete Fragment"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
            </div>
          ))}

          {library.items.length === 0 && (
            <div className="col-span-full py-24 text-center border-2 border-dashed border-neutral-800/50 rounded-[40px] bg-neutral-900/10 flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in-95">
              <div className="p-8 rounded-[32px] bg-neutral-900 border border-neutral-800 shadow-2xl">
                <Plus className="w-16 h-16 text-neutral-800" />
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-black text-neutral-500 tracking-tight italic">Ghost Town</p>
                <p className="text-[10px] font-black text-neutral-700 uppercase tracking-[0.3em]">Add content below to initialize library</p>
              </div>
            </div>
          )}
        </div>

      </div>

      <ConfirmModal
        isOpen={showDeleteLibraryModal}
        onClose={() => setShowDeleteLibraryModal(false)}
        onConfirm={onDelete}
        title="Destroy Library"
        message={`This will permanently delete the collection "${library.name}" and all its fragments. This action is irreversible.`}
        confirmText="Destroy Collection"
        type="danger"
      />

      <ConfirmModal
        isOpen={itemToRemoveIndex !== null}
        onClose={() => setItemToRemoveIndex(null)}
        onConfirm={confirmRemoveItem}
        title="Expunge Fragment"
        message="Are you sure you want to remove this fragment from the collection?"
        confirmText="Remove Now"
        type="danger"
      />
    </div>
  );
}
