import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Tag as TagIcon } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tags: string[]) => void;
  initialTags?: string[];
  title?: string;
  description?: string;
  saveButtonText?: string;
}

export function TagModal({ 
  isOpen, 
  onClose, 
  onSave, 
  initialTags = [], 
  title,
  description,
  saveButtonText
}: Props) {
  const { t } = useTranslation();
  const [tags, setTags] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const resolvedTitle = title ?? t('tagModal.title');
  const resolvedDescription = description ?? t('tagModal.description');
  const resolvedSaveButtonText = saveButtonText ?? t('tagModal.saveTags');

  useEffect(() => {
    if (isOpen) {
      setTags(initialTags);
      setInputValue('');
    }
  }, [isOpen]); // Only reset when the modal opens, not on every render or tag update

  if (!isOpen) return null;

  const handleAddTag = () => {
    const newTags = inputValue.split(',').map(t => t.trim()).filter(t => t);
    // Add unique tags
    const nextTags = Array.from(new Set([...tags, ...newTags]));
    setTags(nextTags);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300 cursor-pointer" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white/40 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-white/5 backdrop-blur-3xl rounded-card shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/20 dark:bg-neutral-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl">
              <TagIcon className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white tracking-tight">{resolvedTitle}</h3>
              <p className="text-[10px] font-bold text-neutral-500 dark:text-neutral-500 uppercase tracking-widest mt-0.5">{resolvedDescription}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-500 dark:text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('tagModal.placeholder')}
              className="flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
              autoFocus
            />
            <button
              onClick={handleAddTag}
              className="px-4 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-xl transition-all font-bold text-xs uppercase tracking-widest"
            >
              {t('tagModal.add')}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 min-h-[100px] content-start">
            {tags.length === 0 && (
              <div className="w-full text-center py-8 text-neutral-600 text-xs font-bold uppercase tracking-widest italic border border-dashed border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl rounded-xl">
                {t('tagModal.noTags')}
              </div>
            )}
            {tags.map(tag => (
              <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-bold tracking-wider">
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-950/40 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 text-neutral-600 dark:text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[10px] transition-all"
          >
            {t('confirmModal.cancel')}
          </button>
          <button 
            onClick={() => {
              onSave(tags);
              onClose();
            }}
            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-neutral-900 dark:text-white shadow-lg shadow-blue-500/20 rounded-xl transition-all font-black uppercase tracking-widest text-[10px]"
          >
            {resolvedSaveButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}
