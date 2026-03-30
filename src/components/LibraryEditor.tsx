import React, { useState } from 'react';
import { Library } from '../types';
import { Trash2, Plus, GripVertical, Image as ImageIcon } from 'lucide-react';

interface Props {
  library: Library;
  onUpdate: (lib: Library) => void;
  onDelete: () => void;
}

export function LibraryEditor({ library, onUpdate, onDelete }: Props) {
  const [newItem, setNewItem] = useState('');

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ ...library, name: e.target.value });
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    onUpdate({ ...library, items: [...library.items, newItem.trim()] });
    setNewItem('');
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...library.items];
    newItems.splice(index, 1);
    onUpdate({ ...library, items: newItems });
  };

  const handleItemChange = (index: number, value: string) => {
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
    <div className="h-full flex flex-col p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex-1">
          <input
            type="text"
            value={library.name}
            onChange={handleNameChange}
            className="text-3xl font-bold bg-transparent border-none outline-none text-white focus:ring-0 p-0 w-full"
            placeholder="Library Name"
          />
          <div className="text-sm text-neutral-500 mt-1 capitalize">{library.type || 'text'} Library</div>
        </div>
        <button 
          onClick={onDelete}
          className="p-2 text-red-400 hover:bg-red-400/10 rounded-md transition-colors ml-4"
          title="Delete Library"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2 mb-6">
          {library.items.map((item, index) => (
            <div key={index} className="flex items-center gap-2 group bg-neutral-900 border border-neutral-800 rounded-md p-2">
              <div className="text-neutral-600 cursor-grab p-1">
                <GripVertical className="w-4 h-4" />
              </div>
              
              {library.type === 'image' ? (
                <div className="flex-1 flex items-center gap-4">
                  <img src={item} alt={`Item ${index}`} className="h-16 w-16 object-cover rounded border border-neutral-700" />
                  <span className="text-xs text-neutral-500 truncate flex-1">Image {index + 1}</span>
                </div>
              ) : (
                <input
                  type="text"
                  value={item}
                  onChange={(e) => handleItemChange(index, e.target.value)}
                  className="flex-1 bg-transparent border-none px-2 py-1 text-sm text-neutral-200 focus:outline-none"
                />
              )}
              
              <button
                onClick={() => handleRemoveItem(index)}
                className="p-2 text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {library.items.length === 0 && (
            <div className="text-center py-8 text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
              No items in this library yet.
            </div>
          )}
        </div>

        {library.type === 'image' ? (
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-neutral-800 border-dashed rounded-lg cursor-pointer bg-neutral-900/50 hover:bg-neutral-900 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <ImageIcon className="w-8 h-8 mb-3 text-neutral-500" />
                <p className="mb-2 text-sm text-neutral-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                <p className="text-xs text-neutral-500">PNG, JPG, WEBP up to 5MB</p>
              </div>
              <input type="file" className="hidden" multiple accept="image/*" onChange={handleImageUpload} />
            </label>
          </div>
        ) : (
          <form onSubmit={handleAddItem} className="flex gap-2">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add new prompt fragment..."
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newItem.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
