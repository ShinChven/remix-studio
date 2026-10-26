import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { fetchLibraries, fetchLibraryItems, fetchProjects, transcribeAssistantAudio } from '../../../api';
import { resolveAssistantSkillsLibraryId } from '../../../lib/assistant-skills';
import {
  CircularProgress,
  cx,
  Icon,
  IconButton,
  InputChip,
  LoadingIndicator,
  MenuButton,
  MenuDivider,
  MenuGroup,
  MenuItem,
  Text,
  useSnackbar,
} from '../../../m3';
import { getTextModelsForProvider, type Provider } from '../../../types';
import { SuggestionList } from '../../ui/SuggestionList';
import { ProviderLogo } from '../ProviderLogo';

export type BoundContextType = 'project' | 'library' | 'campaign' | 'post';

export type BoundContext = {
  id: string;
  name: string;
  type: BoundContextType;
  subType?: string;
};

export interface ComposerHandle {
  addBoundContext: (context: BoundContext) => void;
  focus: () => void;
}

export const BOUND_CONTEXT_ICONS: Record<BoundContextType, string> = {
  project: 'auto_awesome',
  library: 'folder_open',
  campaign: 'campaign',
  post: 'description',
};

export type AttachedImage = {
  id: string;
  preview: string;
  base64: string;
};

type SkillOption = { id: string; title: string; content: string; tags: string[] };

export interface ComposerProps {
  initialInputText?: string;
  initialBoundContexts?: BoundContext[];
  initialAttachedImages?: AttachedImage[];
  contextUsageTokens?: number | null;
  selectedProviderId: string;
  setSelectedProviderId: (id: string) => void;
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  providers: Provider[];
  isSending: boolean;
  isStopping?: boolean;
  onSend: (text: string, boundContexts: BoundContext[], attachedImages: AttachedImage[]) => void;
  onStop?: () => void;
  placeholder?: string;
  composerRef?: Ref<ComposerHandle>;
  /** `hero` is the larger, elevated variant used on the start screen. */
  variant?: 'hero' | 'docked';
}

const MAX_IMAGES = 5;
const MAX_COMPRESS_DIM = 1024;
const COMPRESS_QUALITY = 0.7;
const MAX_RECORDING_MS = 5 * 60 * 1000;
const MOBILE_INPUT_QUERY = '(max-width: 767px), (pointer: coarse)';

function summarizeSkillTitle(title: string | undefined, content: string) {
  if (title?.trim()) return title.trim();
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean) || 'Untitled prompt';
  return firstLine.length > 48 ? `${firstLine.slice(0, 45)}...` : firstLine;
}

function summarizeSkillContent(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

function getSkillTriggerMatch(textBeforeCursor: string) {
  const match = textBeforeCursor.match(/(^|\s)\/([^\n/]*)$/);
  if (!match) return null;
  const query = match[2] || '';
  return { query, start: textBeforeCursor.length - query.length - 1 };
}

function formatCompactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value);
}

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      let w = width;
      let h = height;
      if (Math.max(width, height) > MAX_COMPRESS_DIM) {
        if (width >= height) {
          w = MAX_COMPRESS_DIM;
          h = Math.round((height / width) * MAX_COMPRESS_DIM);
        } else {
          h = MAX_COMPRESS_DIM;
          w = Math.round((width / height) * MAX_COMPRESS_DIM);
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not available'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', COMPRESS_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

/** Context window usage as a small determinate ring next to the model name. */
function ContextUsage({ used, limit, unit }: { used: number; limit?: number; unit?: string }) {
  if (!limit || limit <= 0 || used <= 0) return null;
  const percent = Math.min(100, (used / limit) * 100);
  const label = `Context used: ${used.toLocaleString()} / ${limit.toLocaleString()} ${unit || 'tokens'} (${Math.round(percent)}%)`;
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <CircularProgress
        value={percent}
        size={18}
        thickness={3}
        aria-label={label}
        className={percent >= 90 ? 'v2-progress-error' : percent >= 70 ? 'v2-progress-warning' : undefined}
      />
      <span className="m3-visually-hidden">
        {formatCompactNumber(used)} of {formatCompactNumber(limit)} {unit || 'tokens'}
      </span>
    </span>
  );
}

/**
 * The assistant message composer: model picker, `@` resources, `/` preset prompts, images
 * (pick, paste, drop), voice input through Gemini transcription, and send / stop.
 */
export function Composer({
  initialInputText = '',
  initialBoundContexts = [],
  initialAttachedImages = [],
  contextUsageTokens = 0,
  selectedProviderId,
  setSelectedProviderId,
  selectedModelId,
  setSelectedModelId,
  providers,
  isSending,
  isStopping = false,
  onSend,
  onStop,
  placeholder,
  composerRef,
  variant = 'docked',
}: ComposerProps) {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [inputText, setInputText] = useState(initialInputText);
  const [boundContexts, setBoundContexts] = useState<BoundContext[]>(initialBoundContexts);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>(initialAttachedImages);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartRef = useRef(0);
  const sendAfterTranscribeRef = useRef(false);
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

  const activePicker = skillSearch !== null ? 'skill' : mentionSearch !== null ? 'resource' : null;
  const activeOptions = activePicker === 'skill' ? skillOptions : mentionOptions;
  const isSearchingActivePicker = activePicker === 'skill' ? isSearchingSkills : isSearchingMentions;

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const selectedModel = selectedProvider ? getTextModelsForProvider(selectedProvider.type).find((m) => m.id === selectedModelId) : null;
  const selectedModelLabel = selectedModel?.name || t('assistant.selectModel', 'Select a model');

  const sendWithText = useCallback(
    (text: string) => {
      onSend(text, boundContexts, attachedImages);
      setInputText('');
      setBoundContexts([]);
      setAttachedImages([]);
    },
    [onSend, boundContexts, attachedImages],
  );

  // Grow the textarea with its content up to the max height set in CSS.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [inputText]);

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
        const options: BoundContext[] = [
          ...projectResult.items.map((p) => ({ id: p.id, name: p.name, type: 'project' as const, subType: p.type })),
          ...libraryResult.items.map((l) => ({ id: l.id, name: l.name, type: 'library' as const, subType: l.type })),
        ];
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
        setSkillOptions(
          result.items.map((item) => ({
            id: item.id,
            title: summarizeSkillTitle(item.title, item.content),
            content: item.content,
            tags: item.tags || [],
          })),
        );
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

  const processImageFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length !== files.length) snackbar.show(t('assistant.invalidImageType'));
      if (imageFiles.length === 0) return;
      const remaining = MAX_IMAGES - attachedImages.length;
      if (remaining <= 0) {
        snackbar.show(t('assistant.maxImagesReached'));
        return;
      }
      const toAdd = imageFiles.slice(0, remaining);
      if (toAdd.length < imageFiles.length) snackbar.show(t('assistant.maxImagesReached'));
      const results: AttachedImage[] = [];
      for (const file of toAdd) {
        try {
          const compressed = await compressImage(file);
          results.push({ id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`, preview: compressed, base64: compressed });
        } catch {
          snackbar.show(t('assistant.imageTooLarge'));
        }
      }
      if (results.length > 0) setAttachedImages((prev) => [...prev, ...results]);
    },
    [attachedImages.length, snackbar, t],
  );

  const onFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void processImageFiles(files);
    e.target.value = '';
  };

  // Voice input goes through the selected Google AI provider; other providers hide the mic.
  const micProvider = selectedProvider?.type === 'GoogleAI' ? selectedProvider : null;

  const pickRecordingMimeType = () => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
    return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
  };
  const clearRecordingTimer = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };
  const stopRecordingTracks = () => mediaRecorderRef.current?.stream?.getTracks().forEach((track) => track.stop());

  const transcribeRecordedBlob = useCallback(
    async (blob: Blob, mimeType: string) => {
      const autoSend = sendAfterTranscribeRef.current;
      sendAfterTranscribeRef.current = false;
      if (!micProvider) return;
      if (blob.size === 0) {
        if (autoSend) snackbar.show(t('assistant.micNoSpeechDetected'));
        return;
      }
      setIsTranscribing(true);
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const { text } = await transcribeAssistantAudio({
          providerId: micProvider.id,
          audioBase64: btoa(binary),
          mimeType: mimeType.split(';')[0] || 'audio/webm',
        });
        const trimmed = text.trim();
        if (!trimmed) {
          snackbar.show(t('assistant.micNoSpeechDetected'));
          return;
        }
        const nextText = inputText ? `${inputText}${inputText.endsWith(' ') ? '' : ' '}${trimmed}` : trimmed;
        if (autoSend) sendWithText(nextText);
        else setInputText(nextText);
      } catch (err) {
        console.error('[transcribeRecordedBlob]', err);
        snackbar.show((err as Error)?.message || t('assistant.micTranscribeFailed'));
      } finally {
        setIsTranscribing(false);
      }
    },
    [micProvider, inputText, sendWithText, snackbar, t],
  );

  // The recorder's onstop is bound once per recording; it reaches the latest transcriber here.
  const transcribeRef = useRef(transcribeRecordedBlob);
  useEffect(() => {
    transcribeRef.current = transcribeRecordedBlob;
  }, [transcribeRecordedBlob]);

  const startRecording = async () => {
    if (!micProvider) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      snackbar.show(t('assistant.micUnsupported'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
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
        void transcribeRef.current(blob, chunkMime);
      };
      recorder.onerror = () => {
        clearRecordingTimer();
        stopRecordingTracks();
        sendAfterTranscribeRef.current = false;
        setIsRecording(false);
        setRecordingSeconds(0);
        snackbar.show(t('assistant.micRecordFailed'));
      };
      recordingStartRef.current = Date.now();
      setRecordingSeconds(0);
      recorder.start();
      setIsRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - recordingStartRef.current;
        setRecordingSeconds(Math.floor(elapsed / 1000));
        if (elapsed >= MAX_RECORDING_MS && mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      }, 250);
    } catch (err) {
      console.error('[startRecording]', err);
      snackbar.show((err as Error)?.name === 'NotAllowedError' ? t('assistant.micPermissionDenied') : t('assistant.micRecordFailed'));
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    } else {
      clearRecordingTimer();
      stopRecordingTracks();
      sendAfterTranscribeRef.current = false;
      setIsRecording(false);
      setRecordingSeconds(0);
    }
  };

  const toggleRecording = () => {
    if (isTranscribing) return;
    if (isRecording) {
      sendAfterTranscribeRef.current = false;
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const hasContent = inputText.trim().length > 0 || boundContexts.length > 0 || attachedImages.length > 0;
  const canSend = (hasContent || isRecording) && !isSending && !isTranscribing;

  const handleSendClick = () => {
    if (isTranscribing) return;
    if (isRecording) {
      sendAfterTranscribeRef.current = true;
      stopRecording();
      return;
    }
    sendWithText(inputText);
  };

  useEffect(
    () => () => {
      clearRecordingTimer();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === 'recording') recorder.stop();
      stopRecordingTracks();
    },
    [],
  );

  const focusAt = (position: number) =>
    window.setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(position, position);
    }, 0);

  useImperativeHandle(
    composerRef,
    () => ({
      addBoundContext: (context) => {
        setBoundContexts((current) => (current.some((c) => c.id === context.id && c.type === context.type) ? current : [...current, context]));
        textareaRef.current?.focus();
      },
      focus: () => textareaRef.current?.focus(),
    }),
    [],
  );

  const selectResource = (option: BoundContext | undefined) => {
    if (!option) return;
    if (!boundContexts.find((c) => c.id === option.id)) setBoundContexts((current) => [...current, option]);
    const cursor = textareaRef.current?.selectionStart ?? inputText.length;
    const before = inputText.slice(0, cursor);
    const after = inputText.slice(cursor);
    const match = before.match(/@([a-zA-Z0-9_\-一-龥\s]*)$/);
    if (match) {
      const prefix = before.slice(0, before.length - match[0].length);
      const spacer = prefix.length > 0 && !prefix.endsWith(' ') && !after.startsWith(' ');
      setInputText(`${prefix}${spacer ? ' ' : ''}${after}`);
      focusAt(prefix.length + (spacer ? 1 : 0));
    }
    closePickers();
  };

  const selectSkill = (option: SkillOption | undefined) => {
    if (!option) return;
    const cursor = textareaRef.current?.selectionStart ?? inputText.length;
    const before = inputText.slice(0, cursor);
    const after = inputText.slice(cursor);
    const match = before.match(/\/([^\n/]*)$/);
    if (!match) return;
    const prefix = before.slice(0, before.length - match[0].length);
    setInputText(`${prefix}${option.content}${after}`);
    closePickers();
    focusAt(prefix.length + option.content.length);
  };

  const onInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    const cursor = e.target.selectionStart ?? next.length;
    setInputText(next);
    const before = next.slice(0, cursor);
    const skillMatch = getSkillTriggerMatch(before);
    if (skillMatch && dismissedSkillTriggerStart !== skillMatch.start) {
      setSkillSearch(skillMatch.query);
      setMentionSearch(null);
      return;
    }
    if (skillMatch === null && dismissedSkillTriggerStart !== null) setDismissedSkillTriggerStart(null);
    const mentionMatch = before.match(/@([a-zA-Z0-9_\-一-龥\s]*)$/);
    if (mentionMatch && !mentionMatch[1].includes('\n')) {
      setMentionSearch(mentionMatch[1]);
      setSkillSearch(null);
      return;
    }
    closePickers();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === '/' && activePicker === 'skill') {
      closePickers();
      setDismissedSkillTriggerStart(null);
      return;
    }
    if (activePicker && activeOptions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((i) => (i + 1) % activeOptions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((i) => (i - 1 + activeOptions.length) % activeOptions.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (activePicker === 'skill') selectSkill(skillOptions[selectedIndex]);
        else selectResource(mentionOptions[selectedIndex]);
        return;
      }
    }
    if ((mentionSearch !== null || skillSearch !== null) && event.key === 'Escape') {
      event.preventDefault();
      if (skillSearch !== null) {
        const cursor = textareaRef.current?.selectionStart ?? inputText.length;
        setDismissedSkillTriggerStart(getSkillTriggerMatch(inputText.slice(0, cursor))?.start ?? null);
      }
      closePickers();
      return;
    }
    const pickerIdle = activePicker === null || activeOptions.length === 0;
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && pickerIdle) {
      event.preventDefault();
      if (canSend) handleSendClick();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && pickerIdle && !window.matchMedia(MOBILE_INPUT_QUERY).matches) {
      event.preventDefault();
      if (canSend) handleSendClick();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items).filter((item) => item.type.startsWith('image/'));
    if (items.length === 0) return;
    e.preventDefault();
    void processImageFiles(items.map((item) => item.getAsFile()).filter(Boolean) as File[]);
  };

  const onDragOver = (e: DragEvent) => {
    if (isSending) return;
    if (Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
      setIsDraggingOver(true);
    }
  };
  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (!isSending) void processImageFiles(Array.from(e.dataTransfer.files));
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const pickerOptions =
    activePicker === 'skill'
      ? skillOptions.map((o) => ({
          key: o.id,
          icon: 'bolt',
          label: (
            <span className="flex items-center gap-2">
              <span className="truncate">{o.title}</span>
              {o.tags[0] && <span className="v2-tag">{o.tags[0]}</span>}
            </span>
          ),
          supportingText: summarizeSkillContent(o.content),
        }))
      : mentionOptions.map((o) => ({
          key: `${o.type}:${o.id}`,
          icon: BOUND_CONTEXT_ICONS[o.type],
          label: o.name,
          supportingText: <span className="capitalize">{`${o.type}${o.subType ? ` • ${o.subType}` : ''}`}</span>,
        }));

  return (
    <div
      ref={shellRef}
      className={cx('v2-composer', isDraggingOver && 'is-dragging')}
      data-variant={variant}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDraggingOver && (
        <div className="v2-composer__drop" aria-hidden>
          <Icon name="add_photo_alternate" size={32} />
          <Text variant="label-large">{t('assistant.dropImagesHere')}</Text>
        </div>
      )}

      <div className="v2-composer__toolbar">
        <MenuButton
          placement="bottom-start"
          aria-label={t('assistant.selectModel', 'Select a model')}
          trigger={(props) => (
            <button {...props} type="button" className="v2-model-chip m3-focus-ring" disabled={isSending}>
              {selectedProvider ? <ProviderLogo type={selectedProvider.type} size={16} /> : <Icon name="smart_toy" size={18} />}
              <span className="truncate">{selectedModelLabel}</span>
              <ContextUsage used={contextUsageTokens ?? 0} limit={selectedModel?.promptLimit?.value} unit={selectedModel?.promptLimit?.unit} />
              <Icon name="arrow_drop_down" size={18} />
            </button>
          )}
        >
          <MenuItem
            icon="block"
            onSelect={() => {
              setSelectedProviderId('');
              setSelectedModelId('');
            }}
            selected={!selectedProviderId}
          >
            {t('assistant.selectModel', 'Select a model')}
          </MenuItem>
          {providers.map((provider) => {
            const models = getTextModelsForProvider(provider.type);
            if (models.length === 0) return null;
            return [
              <MenuDivider key={`${provider.id}-divider`} />,
              <MenuGroup key={provider.id} label={provider.name}>
                {models.map((model) => (
                  <MenuItem
                    key={`${provider.id}::${model.id}`}
                    icon={<ProviderLogo type={provider.type} size={16} />}
                    type="radio"
                    checked={provider.id === selectedProviderId && model.id === selectedModelId}
                    onSelect={() => {
                      setSelectedProviderId(provider.id);
                      setSelectedModelId(model.id);
                    }}
                  >
                    {model.name}
                  </MenuItem>
                ))}
              </MenuGroup>,
            ];
          })}
        </MenuButton>

        <div className="ms-auto flex items-center gap-1">
          {micProvider &&
            (isRecording || isTranscribing ? (
              <button type="button" className="v2-record-chip m3-focus-ring" onClick={toggleRecording} disabled={isSending || isTranscribing} data-transcribing={isTranscribing ? '' : undefined}>
                {isTranscribing ? (
                  <>
                    <LoadingIndicator size={20} aria-hidden />
                    <span>{t('assistant.micTranscribing')}</span>
                  </>
                ) : (
                  <>
                    <span className="v2-record-dot" />
                    <span className="tabular-nums">{formatTime(recordingSeconds)}</span>
                    <Icon name="stop" size={18} />
                  </>
                )}
              </button>
            ) : (
              <IconButton icon="mic" label={t('assistant.micStart')} tooltip size="xs" onClick={toggleRecording} disabled={isSending} />
            ))}
          <IconButton
            icon="add_photo_alternate"
            label={t('assistant.attachImage')}
            tooltip
            size="xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || attachedImages.length >= MAX_IMAGES}
            selected={attachedImages.length > 0 ? true : undefined}
            badge={attachedImages.length > 0 ? <span className="v2-count-badge">{attachedImages.length}</span> : undefined}
          />
        </div>
      </div>

      {(boundContexts.length > 0 || attachedImages.length > 0) && (
        <div className="v2-composer__attachments">
          {boundContexts.map((context) => (
            <InputChip
              key={`${context.type}:${context.id}`}
              label={context.name}
              icon={BOUND_CONTEXT_ICONS[context.type] ?? 'folder_open'}
              disabled={isSending}
              onRemove={() => setBoundContexts((current) => current.filter((c) => c.id !== context.id))}
            />
          ))}
          {attachedImages.map((img) => (
            <span key={img.id} className="v2-composer__thumb">
              <img src={img.preview} alt="" />
              <IconButton icon="close" label={t('assistant.removeImage')} size="xs" variant="filled" onClick={() => setAttachedImages((prev) => prev.filter((i) => i.id !== img.id))} disabled={isSending} />
            </span>
          ))}
        </div>
      )}

      <div className="v2-composer__input">
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={onInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => window.setTimeout(closePickers, 150)}
          placeholder={placeholder || t('assistant.typePlaceholder')}
          enterKeyHint="enter"
          disabled={isSending}
          rows={1}
          aria-label={placeholder || t('assistant.typePlaceholder')}
        />
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={onFilePicked} />
        {isSending ? (
          <IconButton
            icon="stop"
            label={isStopping ? t('assistant.stopping', 'Stopping...') : t('assistant.stop')}
            tooltip
            variant="tonal"
            onClick={onStop}
            disabled={!onStop || isStopping}
            className="v2-composer__stop"
          />
        ) : (
          <IconButton
            icon={isTranscribing ? 'hourglass_top' : 'arrow_upward'}
            label={isTranscribing ? t('assistant.micTranscribing') : isRecording ? t('assistant.sendWhileRecording') : t('assistant.send')}
            tooltip
            variant="filled"
            onClick={handleSendClick}
            disabled={!canSend}
          />
        )}
      </div>
      <Text as="span" variant="body-small" className="v2-composer__mobile-hint">
        {t('assistant.mobileInputHint', 'Enter for a new line · Tap the arrow to send')}
      </Text>

      <SuggestionList
        open={activePicker !== null}
        anchor={shellRef.current}
        options={pickerOptions}
        activeIndex={selectedIndex}
        onActiveIndexChange={setSelectedIndex}
        onSelect={(index) => (activePicker === 'skill' ? selectSkill(skillOptions[index]) : selectResource(mentionOptions[index]))}
        loading={isSearchingActivePicker}
        heading={
          isSearchingActivePicker
            ? t('assistant.searching', 'Searching...')
            : activePicker === 'skill'
              ? t('assistant.selectPresetPrompt', 'Select preset prompt')
              : t('assistant.selectResource', 'Select Resource')
        }
        hint={activePicker === 'skill' ? t('assistant.presetPromptEscapeHint', 'Press Esc to keep typing a literal slash.') : undefined}
        emptyText={activePicker === 'skill' ? t('assistant.noPresetPrompts', 'No preset prompts found.') : t('assistant.noMatches', 'No matches found.')}
      />
    </div>
  );
}
