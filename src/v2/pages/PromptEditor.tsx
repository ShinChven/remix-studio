import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { createLibraryItem, fetchLibrary, updateLibraryItem } from '../../api';
import { Button, cx, Icon, IconButton, Text } from '../../m3';
import type { Library } from '../../types';
import { TagDialog } from '../components/TagDialog';
import { LoadingState } from '../ui/Page';
import { Markdown } from '../ui/Markdown';
import { Segmented } from '../ui/Toolbar';

/** Full-page editor for one text item of a library, with a Markdown preview. */
export function PromptEditor() {
  const { t } = useTranslation();
  const { id, index } = useParams<{ id: string; index: string }>();
  const navigate = useNavigate();
  const isNew = index === 'new';
  const token = index || '';
  const [library, setLibrary] = useState<Library | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [fullScreen, setFullScreen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  const [ordinal, setOrdinal] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchLibrary(id)
      .then((lib) => {
        setLibrary(lib);
        if (isNew) {
          setItemId(null);
          setOrdinal(null);
          return;
        }
        const idx = /^\d+$/.test(token) ? Number.parseInt(token, 10) : lib.items.findIndex((item) => item.id === token);
        const item = idx >= 0 ? lib.items[idx] : undefined;
        if (!item) {
          navigate(`/library/${id}`);
          return;
        }
        setItemId(item.id);
        setOrdinal(idx + 1);
        setContent(item.content || '');
        setTitle(item.title || '');
        setTags(item.tags || []);
      })
      .catch(() => navigate('/libraries'));
  }, [id, isNew, token, navigate]);

  const save = async () => {
    if (!library || !id) return;
    setSubmitting(true);
    try {
      if (isNew) await createLibraryItem(id, { id: crypto.randomUUID(), content, title: title.trim(), tags });
      else if (itemId) await updateLibraryItem(id, itemId, { content, title: title.trim(), tags });
      else return;
      navigate(`/library/${id}`);
    } catch (error) {
      console.error('Failed to save library prompt:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (!library) return <LoadingState minHeight={400} />;
  const words = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;

  return (
    <div className={cx('v2-editor', fullScreen && 'v2-editor--fullscreen')} data-density="compact">
      <header className="v2-editor__bar">
        <IconButton icon="arrow_back" label={t('promptEditor.backToLibrary')} tooltip onClick={() => navigate(`/library/${id}`)} className="m3-mirror-rtl" />
        <span className="v2-kind-badge hidden bg-primary-container text-on-primary-container sm:inline-flex">
          <Icon name="sticky_note_2" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <input className="v2-editor__title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isNew ? t('promptEditor.titlePlaceholder') : t('promptEditor.itemTitlePlaceholder')} aria-label={t('promptEditor.titlePlaceholder')} />
          <div className="flex items-center gap-2">
            <Text as="span" variant="label-small" className="truncate uppercase tracking-widest text-on-surface-variant">
              {library.name} {isNew || ordinal === null ? '' : `• #${ordinal}`}
            </Text>
            <Button variant="text" size="xs" icon="sell" onClick={() => setTagsOpen(true)}>
              {tags.length > 0 ? t('promptEditor.tagsCount', { count: tags.length }) : t('promptEditor.addTags')}
            </Button>
          </div>
        </div>
        <Segmented<'edit' | 'preview'>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'edit', label: t('promptEditor.viewMode.edit'), icon: 'edit' },
            { value: 'preview', label: t('promptEditor.viewMode.preview'), icon: 'visibility' },
          ]}
        />
        <IconButton icon={fullScreen ? 'fullscreen_exit' : 'fullscreen'} label={t('promptEditor.toggleFullscreen')} tooltip onClick={() => setFullScreen((f) => !f)} />
        <Button variant="filled" icon="save" loading={submitting} disabled={content.trim() === '' && !isNew} onClick={() => void save()} emphasized>
          {t('promptEditor.save')}
        </Button>
      </header>

      <section className="v2-editor__surface">
        <div className="v2-editor__label">
          <Icon name={mode === 'edit' ? 'description' : 'visibility'} size={16} />
          <Text as="span" variant="label-small" className="uppercase tracking-widest">
            {mode === 'edit' ? t('promptEditor.sourceContent') : t('promptEditor.dynamicPreview')}
          </Text>
          {mode === 'edit' && (
            <Text as="span" variant="label-small" className="ms-auto uppercase tracking-widest text-on-surface-variant">
              {t('promptEditor.markdownSupport')}
            </Text>
          )}
        </div>
        {mode === 'edit' ? (
          <textarea className="v2-editor__textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder={t('promptEditor.editorPlaceholder')} aria-label={t('promptEditor.sourceContent')} />
        ) : (
          <div className="v2-editor__preview">
            {content.trim() === '' ? (
              <Text variant="body-medium" className="py-12 text-center italic text-on-surface-variant">
                {t('promptEditor.previewPlaceholder')}
              </Text>
            ) : (
              <Markdown>{content}</Markdown>
            )}
          </div>
        )}
        <footer className="v2-editor__footer">
          <span>{t('promptEditor.words', { count: words })}</span>
          <span>{t('promptEditor.chars', { count: content.length })}</span>
          <span className="ms-auto inline-flex items-center gap-1">
            <Icon name="calendar_today" size={14} />
            {new Date().toLocaleDateString()}
          </span>
          <span className="hidden sm:inline">{t('promptEditor.libraryLabel', { id: library.id })}</span>
        </footer>
      </section>
      <TagDialog open={tagsOpen} onClose={() => setTagsOpen(false)} onSave={setTags} initialTags={tags} />
    </div>
  );
}
