import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Sparkles, FolderOpen, X, Send, Square } from 'lucide-react';

import { fetchLibraries, fetchLibraryItems, fetchProjects } from '../../api';
import { resolveAssistantSkillsLibraryId } from '../../lib/assistant-skills';
import { getTextModelsForProvider, Provider, ProviderType } from '../../types';
import { ProviderIcon } from '../ProviderIcon';

export type BoundContext = {
  id: string;
  name: string;
  type: 'project' | 'library';
  subType?: string;
};

type SkillOption = {
  id: string;
  title: string;
  content: string;
  tags: string[];
};

type SkillTriggerMatch = {
  query: string;
  start: number;
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

function summarizeSkillTitle(title: string | undefined, content: string) {
  if (title?.trim()) return title.trim();
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean) || 'Untitled prompt';
  return firstLine.length > 48 ? `${firstLine.slice(0, 45)}...` : firstLine;
}

function summarizeSkillContent(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

function getSkillTriggerMatch(textBeforeCursor: string): SkillTriggerMatch | null {
  const match = textBeforeCursor.match(/(^|\s)`([^\n`]*)$/);
  if (!match) return null;

  const query = match[2] || '';
  return {
    query,
    start: textBeforeCursor.length - query.length - 1,
  };
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
  placeholder,
}: AssistantComposerProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionOptions, setMentionOptions] = useState<BoundContext[]>([]);
  const [isSearchingMentions, setIsSearchingMentions] = useState(false);

  const [skillSearch, setSkillSearch] = useState<string | null>(null);
  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([]);
  const [isSearchingSkills, setIsSearchingSkills] = useState(false);
  const [dismissedSkillTriggerStart, setDismissedSkillTriggerStart] = useState<number | null>(null);

  const [selectedIndex, setSelectedIndex] = useState(0);

  const activePicker = skillSearch !== null
    ? 'skill'
    : mentionSearch !== null
      ? 'resource'
      : null;
  const activeOptions = activePicker === 'skill' ? skillOptions : mentionOptions;
  const isSearchingActivePicker = activePicker === 'skill' ? isSearchingSkills : isSearchingMentions;

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }, [inputText]);

  useEffect(() => {
    if (!activePicker || !dropdownRef.current) return;
    const activeItem = dropdownRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activePicker, selectedIndex]);

  useEffect(() => {
    if (mentionSearch === null) return;

    let active = true;
    setIsSearchingMentions(true);

    const timer = window.setTimeout(async () => {
      try {
        const [projectResult, libraryResult] = await Promise.all([
          fetchProjects(1, 10, mentionSearch, 'active'),
          fetchLibraries(1, 10, mentionSearch, false),
        ]);

        if (!active) return;

        const options: BoundContext[] = [];
        projectResult.items.forEach((project: any) => {
          options.push({
            id: project.id,
            name: project.name,
            type: 'project',
            subType: project.type,
          });
        });
        libraryResult.items.forEach((library: any) => {
          options.push({
            id: library.id,
            name: library.name,
            type: 'library',
            subType: library.type,
          });
        });

        setMentionOptions(options);
        setSelectedIndex(0);
      } catch {
        if (active) setMentionOptions([]);
      } finally {
        if (active) setIsSearchingMentions(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mentionSearch]);

  useEffect(() => {
    if (skillSearch === null) return;

    let active = true;
    setIsSearchingSkills(true);

    const timer = window.setTimeout(async () => {
      try {
        const libraryId = await resolveAssistantSkillsLibraryId();
        if (!active) return;

        if (!libraryId) {
          setSkillOptions([]);
          return;
        }

        const result = await fetchLibraryItems(libraryId, 1, 10, skillSearch || undefined);
        if (!active) return;

        const options = result.items.map((item) => ({
          id: item.id,
          title: summarizeSkillTitle(item.title, item.content),
          content: item.content,
          tags: item.tags || [],
        }));

        setSkillOptions(options);
        setSelectedIndex(0);
      } catch {
        if (active) setSkillOptions([]);
      } finally {
        if (active) setIsSearchingSkills(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [skillSearch]);

  useEffect(() => {
    if (dismissedSkillTriggerStart === null) return;
    if (inputText[dismissedSkillTriggerStart] === '`') return;
    setDismissedSkillTriggerStart(null);
  }, [dismissedSkillTriggerStart, inputText]);

  const closePickers = () => {
    setMentionSearch(null);
    setSkillSearch(null);
  };

  const selectResource = (option: BoundContext) => {
    if (!boundContexts.find((entry) => entry.id === option.id)) {
      setBoundContexts((current) => [...current, option]);
    }

    const cursorPosition = textareaRef.current?.selectionStart ?? inputText.length;
    const textBeforeCursor = inputText.slice(0, cursorPosition);
    const textAfterCursor = inputText.slice(cursorPosition);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_\-\u4e00-\u9fa5\s]*)$/);
    if (match) {
      const prefix = textBeforeCursor.slice(0, textBeforeCursor.length - match[0].length);
      const needsSpacer = prefix.length > 0 && !prefix.endsWith(' ') && !textAfterCursor.startsWith(' ');
      const nextValue = `${prefix}${needsSpacer ? ' ' : ''}${textAfterCursor}`;
      setInputText(nextValue);

      window.setTimeout(() => {
        if (!textareaRef.current) return;
        textareaRef.current.focus();
        const nextCursor = prefix.length + (needsSpacer ? 1 : 0);
        textareaRef.current.setSelectionRange(nextCursor, nextCursor);
      }, 0);
    }

    closePickers();
  };

  const selectSkill = (option: SkillOption) => {
    const cursorPosition = textareaRef.current?.selectionStart ?? inputText.length;
    const textBeforeCursor = inputText.slice(0, cursorPosition);
    const textAfterCursor = inputText.slice(cursorPosition);
    const match = textBeforeCursor.match(/`([^\n`]*)$/);
    if (!match) return;

    const prefix = textBeforeCursor.slice(0, textBeforeCursor.length - match[0].length);
    const nextValue = `${prefix}${option.content}${textAfterCursor}`;
    const nextCursor = prefix.length + option.content.length;

    setInputText(nextValue);
    closePickers();

    window.setTimeout(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setInputText(nextValue);

    const cursorPosition = event.target.selectionStart;
    const textBeforeCursor = nextValue.slice(0, cursorPosition);

    const skillMatch = getSkillTriggerMatch(textBeforeCursor);
    if (skillMatch && dismissedSkillTriggerStart !== skillMatch.start) {
      setSkillSearch(skillMatch.query);
      setMentionSearch(null);
      return;
    }

    if (skillMatch === null && dismissedSkillTriggerStart !== null) {
      setDismissedSkillTriggerStart(null);
    }

    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_\-\u4e00-\u9fa5\s]*)$/);
    if (mentionMatch && !mentionMatch[1].includes('\n')) {
      setMentionSearch(mentionMatch[1]);
      setSkillSearch(null);
      return;
    }

    closePickers();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === '`' && activePicker === 'skill') {
      closePickers();
      setDismissedSkillTriggerStart(null);
      return;
    }

    if (activePicker && activeOptions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((index) => (index + 1) % activeOptions.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((index) => (index - 1 + activeOptions.length) % activeOptions.length);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (activePicker === 'skill') {
          selectSkill(skillOptions[selectedIndex]);
        } else {
          selectResource(mentionOptions[selectedIndex]);
        }
        return;
      }
    }

    if ((mentionSearch !== null || skillSearch !== null) && event.key === 'Escape') {
      event.preventDefault();
      if (skillSearch !== null) {
        const cursorPosition = textareaRef.current?.selectionStart ?? inputText.length;
        const textBeforeCursor = inputText.slice(0, cursorPosition);
        const skillMatch = getSkillTriggerMatch(textBeforeCursor);
        setDismissedSkillTriggerStart(skillMatch?.start ?? null);
      }
      closePickers();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && (activePicker === null || activeOptions.length === 0)) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <div className="group relative w-full">
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 opacity-20 blur transition duration-1000 group-focus-within:opacity-40 group-focus-within:duration-200" />

      <div className="relative rounded-2xl border border-neutral-200/50 bg-white/80 p-4 shadow-2xl backdrop-blur-2xl transition-all duration-300 group-focus-within:shadow-indigo-500/10 dark:border-white/10 dark:bg-neutral-900/80">
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <div className="flex h-5 w-5 items-center justify-center text-neutral-500 dark:text-neutral-400">
              {selectedProvider ? (
                <ProviderIcon type={selectedProvider.type} className="h-4 w-4" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
            </div>
            <select
              value={selectedProviderId && selectedModelId ? `${selectedProviderId}::${selectedModelId}` : ''}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (!nextValue) {
                  setSelectedProviderId('');
                  setSelectedModelId('');
                  return;
                }

                const [providerId, modelId] = nextValue.split('::');
                setSelectedProviderId(providerId);
                setSelectedModelId(modelId);
              }}
              disabled={isSending}
              className="cursor-pointer appearance-none border-none bg-transparent p-0 text-xs font-medium text-neutral-500 outline-none transition-colors hover:text-neutral-800 disabled:cursor-not-allowed dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              <option value="">{t('assistant.selectModel', 'Select a model')}</option>
              {providers.map((provider) => {
                const models = getTextModelsForProvider(provider.type);
                if (models.length === 0) return null;

                return (
                  <optgroup key={provider.id} label={provider.name}>
                    {models.map((model) => (
                      <option key={`${provider.id}::${model.id}`} value={`${provider.id}::${model.id}`}>
                        {model.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div className="relative">
            {activePicker && (
              <div
                ref={dropdownRef}
                className="custom-scrollbar absolute bottom-full left-0 z-50 mb-2 max-h-72 w-80 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-neutral-900"
              >
                <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {isSearchingActivePicker
                    ? t('assistant.searching', 'Searching...')
                    : activePicker === 'skill'
                      ? t('assistant.selectPresetPrompt', 'Select preset prompt')
                      : t('assistant.selectResource', 'Select Resource')}
                </div>

                {!isSearchingActivePicker && activeOptions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-neutral-500">
                    {activePicker === 'skill'
                      ? t('assistant.noPresetPrompts', 'No preset prompts found.')
                      : t('assistant.noMatches', 'No matches found.')}
                  </div>
                )}

                {activePicker === 'skill' && (
                  <div className="px-3 pb-2 text-[11px] text-neutral-400 dark:text-neutral-500">
                    {t('assistant.presetPromptEscapeHint', 'Press Esc to keep typing a literal backtick.')}
                  </div>
                )}

                {activePicker === 'resource' && mentionOptions.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    data-index={index}
                    onClick={() => selectResource(option)}
                    className={`flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors ${
                      index === selectedIndex
                        ? 'bg-indigo-600'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <span className={`text-sm font-semibold ${index === selectedIndex ? 'text-white' : 'text-neutral-800 dark:text-neutral-200'}`}>
                      {option.name}
                    </span>
                    <span className={`text-xs capitalize ${index === selectedIndex ? 'text-indigo-100' : 'text-neutral-500'}`}>
                      {option.type}
                      {option.subType ? ` • ${option.subType}` : ''}
                    </span>
                  </button>
                ))}

                {activePicker === 'skill' && skillOptions.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    data-index={index}
                    onClick={() => selectSkill(option)}
                    className={`flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors ${
                      index === selectedIndex
                        ? 'bg-indigo-600'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${index === selectedIndex ? 'text-white' : 'text-neutral-800 dark:text-neutral-200'}`}>
                        {option.title}
                      </span>
                      {option.tags.length > 0 && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          index === selectedIndex
                            ? 'bg-white/15 text-indigo-100'
                            : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                        }`}>
                          {option.tags[0]}
                        </span>
                      )}
                    </div>
                    <span className={`mt-1 text-xs ${index === selectedIndex ? 'text-indigo-100' : 'text-neutral-500'}`}>
                      {summarizeSkillContent(option.content)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {boundContexts.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2 px-1">
                {boundContexts.map((context) => (
                  <span
                    key={context.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300"
                  >
                    {context.type === 'project' ? <Sparkles className="h-3 w-3" /> : <FolderOpen className="h-3 w-3" />}
                    {context.name}
                    <button
                      type="button"
                      onClick={() => setBoundContexts((current) => current.filter((entry) => entry.id !== context.id))}
                      disabled={isSending}
                      className="ml-1 focus:outline-none hover:text-indigo-900 disabled:opacity-30 dark:hover:text-indigo-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || t('assistant.typePlaceholder')}
              rows={1}
              disabled={isSending}
              className="custom-scrollbar max-h-[200px] flex-1 resize-none border-none bg-transparent py-1 text-base text-neutral-800 outline-none placeholder-neutral-400 disabled:opacity-50 dark:text-neutral-200 dark:placeholder-neutral-500"
            />

            {isSending ? (
              <button
                type="button"
                onClick={onStop}
                className="group/btn flex-shrink-0 rounded-xl bg-red-500 p-3 text-white shadow-lg shadow-red-600/20 transition-all active:scale-95 hover:bg-red-600"
                title={t('assistant.stop')}
              >
                <Square className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!inputText.trim() && boundContexts.length === 0}
                className="group/btn flex-shrink-0 rounded-xl bg-indigo-600 p-3 text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:grayscale disabled:opacity-40"
                title={t('assistant.send')}
              >
                <Send className="h-5 w-5 transition-transform group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
