import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Sparkles, FolderOpen, X, Send, Square } from 'lucide-react';
import { fetchProjects, fetchLibraries } from '../../api';
import { getTextModelsForProvider, Provider } from '../../types';

export type BoundContext = {
  id: string;
  name: string;
  type: 'project' | 'library';
  subType?: string;
};

interface AssistantComposerProps {
  inputText: string;
  setInputText: (val: string) => void;
  selectedProviderId: string;
  setSelectedProviderId: (id: string) => void;
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  boundContexts: BoundContext[];
  setBoundContexts: React.Dispatch<React.SetStateAction<BoundContext[]>>;
  providers: Provider[];
  isSending: boolean;
  onSend: () => void;
  onStop?: () => void;
  placeholder?: string;
}

export function AssistantComposer({
  inputText,
  setInputText,
  selectedProviderId,
  setSelectedProviderId,
  selectedModelId,
  setSelectedModelId,
  boundContexts,
  setBoundContexts,
  providers,
  isSending,
  onSend,
  onStop,
  placeholder
}: AssistantComposerProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionOptions, setMentionOptions] = useState<BoundContext[]>([]);
  const [isSearchingMentions, setIsSearchingMentions] = useState(false);

  // ─── Auto-resize textarea ───
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [inputText]);

  // ─── @ Mentions Search ───
  useEffect(() => {
    if (mentionSearch === null) return;
    let active = true;
    setIsSearchingMentions(true);
    const timer = setTimeout(async () => {
      try {
        const [projRes, libRes] = await Promise.all([
          fetchProjects(1, 10, mentionSearch, 'active'),
          fetchLibraries(1, 10, mentionSearch, false)
        ]);
        if (!active) return;
        const options: BoundContext[] = [];
        projRes.items.forEach((p: any) => options.push({ id: p.id, name: p.name, type: 'project', subType: p.type }));
        libRes.items.forEach((l: any) => options.push({ id: l.id, name: l.name, type: 'library', subType: l.type }));
        setMentionOptions(options);
      } catch (e) {
        // silent
      } finally {
        if (active) setIsSearchingMentions(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [mentionSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    
    const el = e.target;
    const cursorPosition = el.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPosition);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_\-\u4e00-\u9fa5\s]*)$/);
    if (match && !match[1].includes('\n')) {
      setMentionSearch(match[1]);
    } else {
      setMentionSearch(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (mentionSearch === null) {
        e.preventDefault();
        onSend();
      }
    }
  };

  return (
    <div className="w-full relative group">
      {/* Glassmorphic Container with depth */}
      <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-1000 group-focus-within:duration-200"></div>

      <div className="relative bg-white/80 dark:bg-neutral-900/80 backdrop-blur-2xl border border-neutral-200/50 dark:border-white/10 rounded-2xl shadow-2xl p-4 transition-all duration-300 group-focus-within:shadow-indigo-500/10">
        <div className="space-y-4">
          {/* Model Selector */}
          <div className="flex items-center gap-2 px-1">
            <Bot className="w-4 h-4 text-indigo-500" />
            <select
              value={selectedProviderId && selectedModelId ? `${selectedProviderId}::${selectedModelId}` : ''}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setSelectedProviderId('');
                  setSelectedModelId('');
                  return;
                }
                const [pId, mId] = val.split('::');
                setSelectedProviderId(pId);
                setSelectedModelId(mId);
              }}
              disabled={isSending}
              className="text-xs bg-transparent border-none text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 outline-none cursor-pointer p-0 appearance-none font-medium transition-colors disabled:cursor-not-allowed"
            >
              <option value="">{t('assistant.selectModel', 'Select a model')}</option>
              {providers.map((p) => {
                const models = getTextModelsForProvider(p.type);
                if (models.length === 0) return null;
                return (
                  <optgroup key={p.id} label={p.name}>
                    {models.map((m) => (
                      <option key={`${p.id}::${m.id}`} value={`${p.id}::${m.id}`}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {/* Context Options & Selected Contexts */}
          <div className="relative">
            {mentionSearch !== null && (
              <div className="absolute left-0 bottom-full mb-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-xl shadow-xl w-72 max-h-60 overflow-y-auto p-1 z-50">
                 <div className="px-2 py-1.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                   {isSearchingMentions ? t('assistant.searching', 'Searching...') : t('assistant.selectResource', 'Select Resource')}
                 </div>
                 {!isSearchingMentions && mentionOptions.length === 0 && (
                   <div className="px-3 py-2 text-sm text-neutral-500">{t('assistant.noMatches', 'No matches found.')}</div>
                 )}
                 {mentionOptions.map(opt => (
                   <button
                     key={opt.id}
                     onClick={() => {
                       if (!boundContexts.find(b => b.id === opt.id)) {
                         setBoundContexts(prev => [...prev, opt]);
                       }
                       const match = inputText.match(/@([a-zA-Z0-9_\-\u4e00-\u9fa5\s]*)$/);
                       if (match) {
                         const newValue = inputText.slice(0, inputText.length - match[0].length) + ' ';
                         setInputText(newValue);
                         if (textareaRef.current) {
                            textareaRef.current.focus();
                            setTimeout(() => {
                              if (textareaRef.current) textareaRef.current.selectionStart = newValue.length;
                            }, 0);
                         }
                       }
                       setMentionSearch(null);
                     }}
                     className="w-full text-left px-3 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex flex-col"
                   >
                      <span className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">{opt.name}</span>
                      <span className="text-xs text-neutral-500 capitalize">{opt.type}{opt.subType ? ` • ${opt.subType}` : ''}</span>
                   </button>
                 ))}
              </div>
            )}
  
            {boundContexts.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 px-1">
                {boundContexts.map(b => (
                  <span key={b.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                    {b.type === 'project' ? <Sparkles className="w-3 h-3" /> : <FolderOpen className="w-3 h-3" />}
                    {b.name}
                    <button 
                      onClick={() => setBoundContexts(prev => prev.filter(item => item.id !== b.id))} 
                      disabled={isSending}
                      className="ml-1 hover:text-indigo-900 dark:hover:text-indigo-100 focus:outline-none disabled:opacity-30"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || t('assistant.typePlaceholder')}
              rows={1}
              disabled={isSending}
              className="flex-1 resize-none bg-transparent border-none outline-none text-base text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-500 max-h-[200px] py-1 custom-scrollbar disabled:opacity-50"
            />
            {isSending ? (
              <button
                onClick={onStop}
                className="flex-shrink-0 p-3 rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-600/20 transition-all active:scale-95 group/btn"
                title={t('assistant.stop')}
              >
                <Square className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={(!inputText.trim() && boundContexts.length === 0)}
                className="flex-shrink-0 p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed group/btn"
                title={t('assistant.send')}
              >
                <Send className="w-5 h-5 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
