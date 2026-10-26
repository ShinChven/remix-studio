import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createLibrary, fetchLibrary, updateLibrary } from '../../api';
import { Button, Icon, Text, TextField } from '../../m3';
import type { LibraryType } from '../../types';
import { ChoiceTiles } from '../ui/ChoiceTiles';
import { kindMeta } from '../ui/entityMeta';
import { Page, PageHeader, Section } from '../ui/Page';

const TYPES: LibraryType[] = ['text', 'image', 'video', 'audio'];
const typeLabelKey = (type: LibraryType) =>
  type === 'image' ? 'libraryForm.typeImage' : type === 'video' ? 'libraryForm.typeVideo' : type === 'audio' ? 'libraryForm.typeAudio' : 'libraryForm.typeText';

export function LibraryForm() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<LibraryType>((searchParams.get('type') as LibraryType) || 'text');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchLibrary(id)
      .then((lib) => {
        setName(lib.name);
        setDescription(lib.description || '');
        setType(lib.type);
      })
      .catch(() => navigate('/libraries'));
  }, [id, navigate]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const trimmedDescription = description.trim();
      let targetId: string;
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

  const meta = kindMeta(type);

  return (
    <Page width="default">
      <PageHeader
        title={isNew ? t('libraryForm.newTitle') : t('libraryForm.editTitle')}
        description={t('libraryForm.description')}
        backLink={{ label: t('libraryForm.cancel'), onClick: () => navigate(-1) }}
      />
      <form onSubmit={(e) => void submit(e)} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Section variant="card">
          <TextField
            variant="outlined"
            label={t('libraryForm.nameLabel')}
            leadingIcon="description"
            value={name}
            onValueChange={setName}
            placeholder={t('libraryForm.namePlaceholder')}
            required
            autoFocus
            fullWidth
          />
          <TextField
            variant="outlined"
            label={t('libraryForm.descriptionLabel', { defaultValue: 'Description' })}
            leadingIcon="info"
            value={description}
            onValueChange={setDescription}
            placeholder={t('libraryForm.descriptionPlaceholder', { defaultValue: 'Explain what this library contains and when it should be used.' })}
            supportingText={t('libraryForm.descriptionHelp', { defaultValue: 'Optional. Shown on cards, profile, and MCP tools.' })}
            maxLength={2000}
            multiline
            rows={6}
            maxRows={14}
            fullWidth
          />
          {isNew && (
            <div className="flex flex-col gap-3">
              <Text variant="label-large" className="text-on-surface-variant">
                {t('libraryForm.typeLabel')}
              </Text>
              <ChoiceTiles<LibraryType>
                columns={4}
                aria-label={t('libraryForm.typeLabel')}
                value={type}
                onChange={setType}
                options={TYPES.map((value) => ({ value, icon: kindMeta(value).icon, tone: kindMeta(value).tone, label: t(typeLabelKey(value), value) }))}
              />
            </div>
          )}
        </Section>

        <aside className="flex flex-col gap-4">
          <Section
            variant="card"
            icon={<Icon name="folder" />}
            title={t('libraryForm.contentSummaryTitle', { defaultValue: 'Content setup' })}
            description={t('libraryForm.contentSummaryDescription', { defaultValue: 'Library type controls accepted items.' })}
          >
            {isNew ? (
              <div className="v2-notice">
                <Icon name={meta.icon} />
                <div className="flex flex-col gap-1">
                  <Text variant="label-large" emphasized>
                    {t(typeLabelKey(type), type)}
                  </Text>
                  <Text variant="body-small" className="text-on-surface-variant">
                    {t('libraryForm.typeDescription', { defaultValue: 'Choose the media family this library will store before creating it.' })}
                  </Text>
                </div>
              </div>
            ) : (
              <div className={`v2-notice ${meta.tone}`}>
                <Icon name={meta.icon} />
                <Text variant="label-large" emphasized className="flex-1">
                  {t('libraryForm.contentType', { type: t(typeLabelKey(type), type) })}
                </Text>
                <Text variant="label-small" className="uppercase opacity-70">
                  {t('libraryForm.permanent')}
                </Text>
              </div>
            )}
          </Section>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outlined" onClick={() => navigate(-1)}>
              {t('libraryForm.cancel')}
            </Button>
            <Button type="submit" variant="filled" icon="save" loading={isSubmitting} disabled={!name.trim()} emphasized>
              {isNew ? t('libraryForm.submitCreate') : t('libraryForm.submitSave')}
            </Button>
          </div>
        </aside>
      </form>
    </Page>
  );
}
