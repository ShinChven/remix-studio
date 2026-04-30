import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AudioLines, FileText, Folder, Image as ImageIcon, Info, Music, Save, Type, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createLibrary, updateLibrary, fetchLibrary } from '../api';
import { LibraryType } from '../types';
import { PageHeader } from '../components/PageHeader';

const libraryTypes: Array<{ type: LibraryType; icon: typeof Type }> = [
  { type: 'text', icon: Type },
  { type: 'image', icon: ImageIcon },
  { type: 'video', icon: Video },
  { type: 'audio', icon: AudioLines },
];

function typeButtonClasses(type: LibraryType, selected: boolean) {
  if (!selected) {
    return 'border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-neutral-900/50 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-neutral-900';
  }
  if (type === 'image') return 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 shadow-emerald-500/10';
  if (type === 'video') return 'border-purple-500/60 bg-purple-500/10 text-purple-600 dark:text-purple-300 shadow-purple-500/10';
  if (type === 'audio') return 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-300 shadow-amber-500/10';
  return 'border-blue-500/60 bg-blue-500/10 text-blue-600 dark:text-blue-300 shadow-blue-500/10';
}

function typeLabelKey(type: LibraryType) {
  if (type === 'image') return 'libraryForm.typeImage';
  if (type === 'video') return 'libraryForm.typeVideo';
  if (type === 'audio') return 'libraryForm.typeAudio';
  return 'libraryForm.typeText';
}

export function LibraryForm() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const isNew = !id;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<LibraryType>('text');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchLibrary(id).then(lib => {
        setName(lib.name);
        setDescription(lib.description || '');
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
      const trimmedDescription = description.trim();

      if (isNew) {
        targetId = crypto.randomUUID();
        await createLibrary({ id: targetId, name: name.trim(), description: trimmedDescription || undefined, type });
      } else {
        targetId = id!;
        await updateLibrary(targetId, { name: name.trim(), description: trimmedDescription, type });
      }

      navigate(`/library/${targetId}`);
    } catch (error) {
      console.error('Failed to save library:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const CurrentIcon = libraryTypes.find((option) => option.type === type)?.icon || Folder;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title={isNew ? t('libraryForm.newTitle') : t('libraryForm.editTitle')}
          description={t('libraryForm.description')}
          backLink={{ label: t('libraryForm.cancel'), onClick: () => navigate(-1) }}
        />

        <form onSubmit={handleSubmit} className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6 rounded-lg border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/55 md:p-6">
            <section className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                <FileText className="h-3.5 w-3.5" />
                {t('libraryForm.nameLabel')}
              </label>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('libraryForm.namePlaceholder')}
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-base font-semibold text-neutral-950 shadow-sm transition-all placeholder:text-neutral-400 focus:border-blue-500/60 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-600"
                required
              />
            </section>

            <section className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                <Info className="h-3.5 w-3.5" />
                {t('libraryForm.descriptionLabel', { defaultValue: 'Description' })}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('libraryForm.descriptionPlaceholder', { defaultValue: 'Explain what this library contains and when it should be used.' })}
                maxLength={2000}
                rows={7}
                className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 shadow-sm transition-all placeholder:text-neutral-400 focus:border-blue-500/60 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600"
              />
              <div className="flex justify-between text-[11px] font-medium text-neutral-500 dark:text-neutral-500">
                <span>{t('libraryForm.descriptionHelp', { defaultValue: 'Optional. Shown on cards, profile, and MCP tools.' })}</span>
                <span>{description.length}/2000</span>
              </div>
            </section>

            {isNew && (
              <section className="space-y-3">
                <label className="text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">{t('libraryForm.typeLabel')}</label>
                <div className="grid grid-cols-2 gap-3">
                  {libraryTypes.map((option) => {
                    const Icon = option.icon;
                    const selected = type === option.type;
                    return (
                      <button
                        key={option.type}
                        type="button"
                        onClick={() => setType(option.type)}
                        className={`flex min-h-24 flex-col items-start justify-between rounded-lg border p-4 text-left shadow-sm transition-all ${typeButtonClasses(option.type, selected)}`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-sm font-black uppercase tracking-wider">{t(typeLabelKey(option.type), option.type)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-lg border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/55">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-lg bg-neutral-100 p-2 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  <Folder className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-neutral-950 dark:text-white">{t('libraryForm.contentSummaryTitle', { defaultValue: 'Content setup' })}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500">{t('libraryForm.contentSummaryDescription', { defaultValue: 'Library type controls accepted items.' })}</p>
                </div>
              </div>

              {isNew ? (
                <div className="rounded-lg border border-neutral-200/70 bg-neutral-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                    <CurrentIcon className="h-3.5 w-3.5" />
                    {t(typeLabelKey(type), type)}
                  </div>
                  <p className="text-sm leading-6 text-neutral-600 dark:text-neutral-400">
                    {t('libraryForm.typeDescription', { defaultValue: 'Choose the media family this library will store before creating it.' })}
                  </p>
                </div>
              ) : (
                <div className={`flex items-center gap-3 rounded-lg border p-4 ${type === 'image' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300' : type === 'video' ? 'border-purple-500/20 bg-purple-500/5 text-purple-600 dark:text-purple-300' : type === 'audio' ? 'border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-300' : 'border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-300'}`}>
                  {type === 'image' ? <ImageIcon className="h-5 w-5" /> :
                   type === 'video' ? <Video className="h-5 w-5" /> :
                   type === 'audio' ? <Music className="h-5 w-5" /> :
                   <Type className="h-5 w-5" />}
                  <span className="text-sm font-black">{t('libraryForm.contentType', { type: t(typeLabelKey(type), type) })}</span>
                  <span className="ml-auto text-[10px] font-black uppercase tracking-[0.1em] opacity-60">{t('libraryForm.permanent')}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.98] dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {t('libraryForm.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/15 transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {isNew ? t('libraryForm.submitCreate') : t('libraryForm.submitSave')}
              </button>
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
}
