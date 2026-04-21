import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Sparkles, FolderOpen, X, Send, Square, ImagePlus, Mic, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { fetchLibraries, fetchLibraryItems, fetchProjects, transcribeAssistantAudio } from '../../api';
import { resolveAssistantSkillsLibraryId } from '../../lib/assistant-skills';
import { getTextModelsForProvider, Provider } from '../../types';
import { ProviderIcon } from '../ProviderIcon';

export type BoundContext = {
  id: string;
  name: string;
  type: 'project' | 'library';
  subType?: string;
};

export type AttachedImage = {
  id: string;
  preview: string; // data URI for display
  base64: string;  // data URI for sending (compressed)
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

export interface AssistantComposerProps {
  initialInputText?: string;
  initialBoundContexts?: BoundContext[];
  initialAttachedImages?: AttachedImage[];
  selectedProviderId: string;
  setSelectedProviderId: (id: string) => void;
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  providers: Provider[];
  isSending: boolean;
  onSend: (text: string, boundContexts: BoundContext[], attachedImages: AttachedImage[]) => void;
  onStop?: () => void;
  placeholder?: string;
}

const MAX_IMAGES = 5;
const MAX_COMPRESS_DIM = 1024;
const COMPRESS_QUALITY = 0.7;
const COMPRESS_MIME = 'image/jpeg';
const MAX_RECORDING_MS = 5 * 60 * 1000;

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

/**
 * Compress an image File to a JPEG data URI with max dimension `MAX_COMPRESS_DIM`.
 */
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      let targetW = width;
      let targetH = height;
      if (Math.max(width, height) > MAX_COMPRESS_DIM) {
        if (width >= height) {
          targetW = MAX_COMPRESS_DIM;
          targetH = Math.round((height / width) * MAX_COMPRESS_DIM);
        } else {
          targetH = MAX_COMPRESS_DIM;
          targetW = Math.round((width / height) * MAX_COMPRESS_DIM);
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not available')); return; }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL(COMPRESS_MIME, COMPRESS_QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

export function AssistantComposer({
  initialInputText = '',
  initialBoundContexts = [],
  initialAttachedImages = [],
  selectedProviderId,
  setSelectedProviderId,
  selectedModelId,
  setSelectedModelId,
  providers,
  isSending,
  onSend,
  onStop,
  placeholder,
}: AssistantComposerProps) {
  const { t } = useTranslation();
  
  const [inputText, setInputText] = useState(initialInputText);
  const [boundContexts, setBoundContexts] = useState<BoundContext[]>(initialBoundContexts);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>(initialAttachedImages);

  const _handleSend = () => {
    onSend(inputText, boundContexts, attachedImages);
    setInputText('');
    setBoundContexts([]);
    setAttachedImages([]);
  };
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);

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

  // ─── Image handling ───

  const processImageFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length !== files.length) {
      toast.warning(t('assistant.invalidImageType'));
    }
    if (imageFiles.length === 0) return;

    const remaining = MAX_IMAGES - attachedImages.length;
    if (remaining <= 0) {
      toast.warning(t('assistant.maxImagesReached'));
      return;
    }

    const toAdd = imageFiles.slice(0, remaining);
    if (toAdd.length < imageFiles.length) {
      toast.warning(t('assistant.maxImagesReached'));
    }

    const results: AttachedImage[] = [];
    for (const file of toAdd) {
      try {
        const compressed = await compressImage(file);
        results.push({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          preview: compressed,
          base64: compressed,
        });
      } catch {
        toast.error(t('assistant.imageTooLarge'));
      }
    }

    if (results.length > 0) {
      setAttachedImages((prev) => [...prev, ...results]);
    }
  }, [attachedImages.length, setAttachedImages, t]);

  const handleFilePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) processImageFiles(files);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  // ─── Audio recording → Gemini transcription ───
  // The mic uses the currently-selected Google AI provider (Gemini 3.1 Flash Lite).
  // When the selected provider is not Google AI, the button is hidden entirely.

  const micProvider = selectedProvider?.type === 'GoogleAI' ? selectedProvider : null;

  const pickRecordingMimeType = (): string => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported?.(type)) return type;
    }
    return '';
  };

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const stopRecordingTracks = () => {
    mediaRecorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
  };

  const transcribeRecordedBlob = useCallback(async (blob: Blob, mimeType: string) => {
    if (!micProvider) return;
    if (blob.size === 0) return;

    setIsTranscribing(true);
    try {
      const arrayBuffer = await blob.arrayBuffer();
      // Convert to base64 without the data: prefix
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      const cleanMime = mimeType.split(';')[0] || 'audio/webm';
      const { text } = await transcribeAssistantAudio({
        providerId: micProvider.id,
        audioBase64: base64,
        mimeType: cleanMime,
      });
      const trimmed = text.trim();
      if (!trimmed) {
        toast.warning(t('assistant.micNoSpeechDetected'));
        return;
      }
      setInputText(inputText ? `${inputText}${inputText.endsWith(' ') ? '' : ' '}${trimmed}` : trimmed);
    } catch (err: any) {
      console.error('[transcribeRecordedBlob]', err);
      toast.error(err?.message || t('assistant.micTranscribeFailed'));
    } finally {
      setIsTranscribing(false);
    }
  }, [micProvider, inputText, setInputText, t]);

  const startRecording = async () => {
    if (!micProvider) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error(t('assistant.micUnsupported'));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        clearRecordingTimer();
        stopRecordingTracks();
        setIsRecording(false);
        setRecordingSeconds(0);
        const chunkMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: chunkMime });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        void transcribeRecordedBlob(blob, chunkMime);
      };

      recorder.onerror = () => {
        clearRecordingTimer();
        stopRecordingTracks();
        setIsRecording(false);
        setRecordingSeconds(0);
        toast.error(t('assistant.micRecordFailed'));
      };

      recordingStartRef.current = Date.now();
      setRecordingSeconds(0);
      recorder.start();
      setIsRecording(true);

      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - recordingStartRef.current;
        setRecordingSeconds(Math.floor(elapsed / 1000));
        if (elapsed >= MAX_RECORDING_MS) {
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }
      }, 250);
    } catch (err: any) {
      console.error('[startRecording]', err);
      const message = err?.name === 'NotAllowedError'
        ? t('assistant.micPermissionDenied')
        : t('assistant.micRecordFailed');
      toast.error(message);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    } else {
      clearRecordingTimer();
      stopRecordingTracks();
      setIsRecording(false);
      setRecordingSeconds(0);
    }
  };

  const toggleRecording = () => {
    if (isTranscribing) return;
    if (isRecording) stopRecording();
    else void startRecording();
  };

  useEffect(() => {
    return () => {
      clearRecordingTimer();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === 'recording') recorder.stop();
      stopRecordingTracks();
    };
  }, []);

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isSending) return;
    const hasImages = Array.from(e.dataTransfer.types).includes('Files');
    if (hasImages) {
      e.preventDefault();
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // only clear if leaving the composer container entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (isSending) return;
    const files = Array.from(e.dataTransfer.files);
    processImageFiles(files);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    e.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter(Boolean) as File[];
    processImageFiles(files);
  };

  const removeImage = (id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  };

  // ─── Mention / skill pickers ───

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
      _handleSend();
    }
  };

  const canSend = (inputText.trim().length > 0 || boundContexts.length > 0 || attachedImages.length > 0) && !isSending;

  return (
    <div
      className={`group relative w-full transition-all duration-200 ${isDraggingOver ? 'scale-[1.01]' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 opacity-20 blur transition duration-1000 group-focus-within:opacity-40 group-focus-within:duration-200" />

      {/* Drag overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/90 dark:bg-indigo-950/90 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-indigo-600 dark:text-indigo-300">
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm font-semibold">{t('assistant.dropImagesHere')}</span>
          </div>
        </div>
      )}

      <div className="relative rounded-2xl border border-neutral-200/50 bg-white/80 p-4 shadow-2xl backdrop-blur-2xl transition-all duration-300 group-focus-within:shadow-indigo-500/10 dark:border-white/10 dark:bg-neutral-900/80">
        <div className="space-y-4">
          {/* Model selector row */}
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

            <div className="ml-auto flex items-center gap-1">
              {/* Mic button — only shown when a Google AI provider is selected */}
              {micProvider && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={isSending || isTranscribing}
                  title={isRecording ? t('assistant.micStop') : t('assistant.micStart')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    isRecording
                      ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-300'
                      : isTranscribing
                        ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                        : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
                  }`}
                >
                  {isTranscribing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t('assistant.micTranscribing')}</span>
                    </>
                  ) : isRecording ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                      </span>
                      <span className="tabular-nums">{formatRecordingTime(recordingSeconds)}</span>
                    </>
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>
              )}

              {/* Image attach button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || attachedImages.length >= MAX_IMAGES}
                title={t('assistant.attachImage')}
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  attachedImages.length > 0
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                <ImagePlus className="h-4 w-4" />
                {attachedImages.length > 0 && (
                  <span className="ml-0.5">{attachedImages.length}</span>
                )}
              </button>
            </div>
          </div>

          {/* Picker dropdowns + bound context chips */}
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

            {/* Bound context chips */}
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

            {/* Attached image thumbnails */}
            {attachedImages.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2 px-1">
                {attachedImages.map((img) => (
                  <div key={img.id} className="relative group/thumb flex-shrink-0">
                    <img
                      src={img.preview}
                      alt=""
                      className="h-16 w-16 rounded-xl object-cover border border-neutral-200/60 dark:border-white/10 shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      disabled={isSending}
                      title={t('assistant.removeImage')}
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800/80 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity shadow-sm disabled:cursor-not-allowed hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

              </div>
            )}
          </div>

          {/* Textarea + action buttons */}
          <div className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder || t('assistant.typePlaceholder')}
              rows={1}
              disabled={isSending}
              className="custom-scrollbar max-h-[200px] flex-1 resize-none border-none bg-transparent py-1 text-base text-neutral-800 outline-none placeholder-neutral-400 disabled:opacity-50 dark:text-neutral-200 dark:placeholder-neutral-500"
            />

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFilePickerChange}
            />

            {isSending ? (
              <button
                type="button"
                onClick={onStop}
                className="group/btn flex-shrink-0 rounded-xl bg-red-500 p-3 text-white shadow-lg shadow-red-600/20 transition-all hover:bg-red-600 hover:shadow-xl hover:shadow-red-500/30 hover:scale-[1.02] active:scale-[0.98]"
                title={t('assistant.stop')}
              >
                <Square className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => _handleSend()}
                disabled={!canSend}
                className="group/btn flex-shrink-0 rounded-xl bg-indigo-600 p-3 text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:grayscale disabled:opacity-40"
                title={t('assistant.send')}
              >
                <Send className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
