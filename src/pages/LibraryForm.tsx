import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Folder, Type, Image as ImageIcon } from 'lucide-react';
import { createLibrary, updateLibrary, fetchLibrary } from '../api';

export function LibraryForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const isNew = !id;

  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'image'>('text');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchLibrary(id).then(lib => {
        setName(lib.name);
        setType(lib.type);
      }).catch(() => navigate('/libraries'));
    }
  }, [id, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      let targetId: string;

      if (isNew) {
        targetId = crypto.randomUUID();
        await createLibrary({ id: targetId, name: name.trim(), type });
      } else {
        targetId = id!;
        await updateLibrary(targetId, { name: name.trim(), type });
      }

      navigate(`/library/${targetId}`);
    } catch (error) {
      console.error('Failed to save library:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 md:p-8 bg-neutral-950">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-blue-600/10 rounded-2xl">
            <Folder className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {isNew ? 'New Library' : 'Edit Library'}
            </h2>
            <p className="text-sm text-neutral-500">Define your library properties</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">Library Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Character Outfits, Sci-Fi Context..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all placeholder:text-neutral-700"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 ml-1">Content Type</label>
            {isNew ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType('text')}
                  className={`flex items-center justify-center gap-3 p-4 rounded-2xl border transition-all ${
                    type === 'text'
                      ? 'bg-blue-600/10 border-blue-500/50 text-blue-400'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-600 hover:border-neutral-700'
                  }`}
                >
                  <Type className="w-5 h-5" />
                  <span className="text-sm font-bold">Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('image')}
                  className={`flex items-center justify-center gap-3 p-4 rounded-2xl border transition-all ${
                    type === 'image'
                      ? 'bg-emerald-600/10 border-emerald-500/50 text-emerald-400'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-600 hover:border-neutral-700'
                  }`}
                >
                  <ImageIcon className="w-5 h-5" />
                  <span className="text-sm font-bold">Image</span>
                </button>
              </div>
            ) : (
              <div className={`flex items-center gap-3 p-4 rounded-2xl border ${
                type === 'image' ? 'bg-emerald-600/5 border-emerald-500/20 text-emerald-400' : 'bg-blue-600/5 border-blue-500/20 text-blue-400'
              }`}>
                {type === 'image' ? <ImageIcon className="w-5 h-5" /> : <Type className="w-5 h-5" />}
                <span className="text-sm font-bold capitalize">{type} Content</span>
                <span className="ml-auto text-[10px] font-black uppercase tracking-[0.1em] opacity-50">Permanent</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-500/20 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isNew ? 'Create Library' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
