import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Library } from '../types';
import { Trash2, Plus, GripVertical, Image as ImageIcon, Save, CheckCircle2, Edit3, X, Check, Settings } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

interface Props {
  library: Library;
  onUpdate: (lib: Library) => void;
  onDelete: () => void;
}

export function LibraryEditor({ library, onUpdate, onDelete }: Props) {
  const navigate = useNavigate();
  const [localLibrary, setLocalLibrary] = useState<Library>(library);
  const [newItem, setNewItem] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  const [showDeleteLibraryModal, setShowDeleteLibraryModal] = useState(false);
  const [itemToRemoveIndex, setItemToRemoveIndex] = useState<number | null>(null);

  useEffect(() => {
    setLocalLibrary(library);
    setHasChanges(false);
    setEditingItemIndex(null);
  }, [library.id]);

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    setLocalLibrary({ ...localLibrary, items: [...localLibrary.items, newItem.trim()] });
    setNewItem('');
    setHasChanges(true);
  };

  const handleRemoveItem = (index: number) => {
    setItemToRemoveIndex(index);
  };

  const confirmRemoveItem = () => {
    if (itemToRemoveIndex !== null) {
      const newItems = [...localLibrary.items];
      newItems.splice(itemToRemoveIndex, 1);
      setLocalLibrary({ ...localLibrary, items: newItems });
      setHasChanges(true);
      setItemToRemoveIndex(null);
    }
  };

  const handleItemSave = (index: number, value: string) => {
    const newItems = [...localLibrary.items];
    newItems[index] = value;
    setLocalLibrary({ ...localLibrary, items: newItems });
    setHasChanges(true);
    setEditingItemIndex(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const newItems = [...localLibrary.items];
    let loadedCount = 0;

    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          newItems.push(e.target.result as string);
        }
        loadedCount++;
        if (loadedCount === files.length) {
          setLocalLibrary({ ...localLibrary, items: newItems });
          setHasChanges(true);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSave = () => {
    onUpdate(localLibrary);
    setHasChanges(false);
  };

  return (
    <div className="h-full flex flex-col p-8 max-w-5xl mx-auto overflow-hidden">
      <div className="flex items-center justify-between mb-8 flex-shrink-0">
        <div className="flex-1">
          <div className="flex items-center gap-3 group">
            <h2 className="text-3xl font-bold text-white tracking-tight">{library.name}</h2>
            <button 
              onClick={() => navigate(`/library/${library.id}/edit`)}
              className="p-2 text-neutral-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-400/10 rounded-lg"
              title="Edit Library Information"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center gap-4 mt-1.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-2 py-0.5 bg-neutral-900 border border-neutral-800 rounded-md">
              {library.type || 'text'} Collection
            </div>
            {hasChanges ? (
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse outline outline-2 outline-amber-500/30" />
                Unsaved Changes
              </span>
            ) : (
              <span className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Synced
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold tracking-tight transition-all flex items-center gap-2.5 shadow-xl ${
              hasChanges 
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30 active:scale-[0.98]' 
              : 'bg-neutral-900 text-neutral-600 border border-neutral-800'
            }`}
          >
            <Save className={`w-4 h-4 ${hasChanges ? 'animate-bounce-subtle' : ''}`} />
            Save Fragments
          </button>
          
          <button 
            onClick={() => setShowDeleteLibraryModal(true)}
            className="p-2.5 text-neutral-600 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all border border-transparent hover:border-red-400/20"
            title="Remove Library"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8">
        <div className={localLibrary.type === 'image' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" : "space-y-3"}>
          {localLibrary.items.map((item, index) => (
            <div key={index} className="group relative">
              {editingItemIndex === index ? (
                <div className="bg-neutral-900 border-2 border-blue-500/50 rounded-2xl p-4 shadow-2xl animate-in zoom-in-95 duration-200">
                  {localLibrary.type === 'image' ? (
                     <div className="space-y-3 text-center py-4">
                       <p className="text-xs text-neutral-500 font-medium font-mono">Image reference only</p>
                       <button onClick={() => setEditingItemIndex(null)} className="text-xs font-black text-blue-400 uppercase tracking-widest hover:text-blue-300">Close</button>
                     </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <textarea
                        autoFocus
                        defaultValue={item}
                        onBlur={(e) => handleItemSave(index, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleItemSave(index, (e.target as HTMLTextAreaElement).value);
                          }
                          if (e.key === 'Escape') setEditingItemIndex(null);
                        }}
                        className="w-full bg-neutral-950 text-sm text-neutral-200 p-3 rounded-xl focus:outline-none border border-neutral-800 min-h-[100px] leading-relaxed"
                      />
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] text-neutral-600 font-mono tracking-wider italic">Esc: cancel • Enter: commit</span>
                        <div className="flex gap-2">
                           <button onClick={() => setEditingItemIndex(null)} className="p-1.5 text-neutral-500 hover:text-emerald-500 transition-colors"><Check className="w-5 h-5" /></button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className={`bg-neutral-900/50 border border-neutral-800/80 rounded-2xl transition-all hover:bg-neutral-900 hover:border-neutral-700 hover:shadow-lg ${localLibrary.type === 'image' ? 'aspect-square flex flex-col' : 'p-4 flex items-center justify-between gap-4'}`}>
                  {localLibrary.type === 'image' ? (
                    <>
                      <div className="flex-1 overflow-hidden rounded-t-2xl relative">
                        <img src={item} alt={`${index}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                           <button onClick={() => handleRemoveItem(index)} className="p-2 bg-red-500 text-white rounded-lg shadow-lg hover:scale-110 transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <div className="p-3 flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                        <span>IMG_{index + 1}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-4 flex-1">
                        <div className="text-neutral-700 p-1 flex-shrink-0">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <p className="text-sm text-neutral-300 leading-relaxed max-w-2xl">{item}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={() => setEditingItemIndex(index)}
                          className="p-2 text-neutral-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleRemoveItem(index)}
                          className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          {localLibrary.items.length === 0 && (
            <div className="col-span-full py-20 text-center text-neutral-600 border-2 border-dashed border-neutral-800/50 rounded-3xl bg-neutral-900/20 flex flex-col items-center gap-4 translate-y-4 animate-in fade-in slide-in-from-bottom-2">
              <Plus className="w-12 h-12 text-neutral-800" />
              <div>
                <p className="text-lg font-bold text-neutral-500 tracking-tight">Empty Collection</p>
                <p className="text-xs font-medium text-neutral-700 uppercase tracking-widest mt-1">Add fragments below to populate</p>
              </div>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="sticky bottom-0 pt-8 mt-auto pb-4 bg-gradient-to-t from-neutral-950 via-neutral-950/90 to-transparent flex-shrink-0">
          {localLibrary.type === 'image' ? (
            <label className="flex flex-col items-center justify-center w-full h-44 border-2 border-neutral-800 border-dashed rounded-3xl cursor-pointer bg-neutral-900/10 hover:bg-neutral-900/40 hover:border-blue-500/40 transition-all group shadow-2xl">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <div className="p-4 rounded-full bg-neutral-900 border border-neutral-800 mb-4 group-hover:scale-110 transition-all group-hover:border-blue-500/50">
                  <ImageIcon className="w-7 h-7 text-neutral-600 group-hover:text-blue-500" />
                </div>
                <p className="text-sm font-bold text-neutral-500 group-hover:text-neutral-200 tracking-tight">Drop images to expand library</p>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-700 mt-2">JPG • PNG • WEBP</p>
              </div>
              <input type="file" className="hidden" multiple accept="image/*" onChange={handleImageUpload} />
            </label>
          ) : (
            <form onSubmit={handleAddItem} className="bg-neutral-900/50 p-4 border border-neutral-800 rounded-2xl flex gap-4 backdrop-blur-md shadow-2xl">
              <input
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Type a new prompt fragment and strike Enter..."
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
              />
              <button
                type="submit"
                disabled={!newItem.trim()}
                className="px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-30 disabled:grayscale transition-all shadow-xl shadow-blue-500/20 active:scale-[0.98]"
              >
                Insert
              </button>
            </form>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={showDeleteLibraryModal}
        onClose={() => setShowDeleteLibraryModal(false)}
        onConfirm={onDelete}
        title="Delete Library"
        message={`Are you sure you want to delete the library "${localLibrary.name}"? This action cannot be undone.`}
        confirmText="Delete Library"
        type="danger"
      />

      <ConfirmModal
        isOpen={itemToRemoveIndex !== null}
        onClose={() => setItemToRemoveIndex(null)}
        onConfirm={confirmRemoveItem}
        title="Remove Item"
        message="Are you sure you want to remove this item from the library?"
        confirmText="Remove Item"
        type="danger"
      />
    </div>
  );
}
