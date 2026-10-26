import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createProvider, fetchProvider, updateProvider } from '../../api';
import { Button, DataTable, Icon, IconButton, Ripple, Text, TextField } from '../../m3';
import { PROVIDER_MODELS_MAP, type ProviderType } from '../../types';
import { ProviderLogo } from '../components/ProviderLogo';
import { NumberField } from '../ui/NumberField';
import { ErrorState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { StatusPill } from '../ui/Stat';

const PROVIDER_TYPES: ProviderType[] = ['GoogleAI', 'VertexAI', 'OpenAI', 'Claude', 'Grok', 'Alibabacloud', 'Kimi', 'MiniMax', 'RunningHub', 'KlingAI', 'BytePlus', 'Replicate', 'BlackForestLabs', 'Civitai'];
const CATEGORY_ICON: Record<string, string> = { text: 'chat', image: 'image', video: 'movie', audio: 'music_note' };

/** A secret field that never offers itself to password managers: masked text, not a password. */
function SecretField({ label, value, onChange, placeholder, supporting }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; supporting?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      variant="outlined"
      label={label}
      value={value}
      onValueChange={onChange}
      placeholder={placeholder}
      supportingText={supporting}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      data-lpignore="true"
      data-1p-ignore="true"
      data-bwignore="true"
      leadingIcon="key"
      inputClassName={shown ? 'font-mono' : 'font-mono v2-masked'}
      trailingIcon={<IconButton icon={shown ? 'visibility_off' : 'visibility'} label={shown ? 'Hide' : 'Show'} size="xs" onClick={() => setShown((s) => !s)} />}
      fullWidth
    />
  );
}

export function ProviderForm() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedType = searchParams.get('type') as ProviderType | null;

  const [name, setName] = useState('');
  const [type, setType] = useState<ProviderType>(requestedType && PROVIDER_TYPES.includes(requestedType) ? requestedType : 'GoogleAI');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [concurrency, setConcurrency] = useState(1);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [hasExistingSecret, setHasExistingSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const p = await fetchProvider(id!);
        setName(p.name);
        setType(p.type);
        setApiUrl(p.apiUrl || '');
        setConcurrency(p.concurrency || 1);
        setHasExistingKey(p.hasKey);
        setHasExistingSecret(Boolean(p.hasSecret));
      } catch {
        navigate(id ? `/provider/${id}` : '/providers');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id, isEditing, navigate]);

  const leave = () => navigate(isEditing ? `/provider/${id}` : '/providers');

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    const keyMissing = t(type === 'KlingAI' ? 'providerForm.errors.accessKeyRequired' : 'providerForm.errors.apiKeyRequired');
    if (!isEditing && !apiKey.trim()) return setError(keyMissing);
    if (isEditing && !apiKey.trim() && !hasExistingKey) return setError(keyMissing);
    if (type === 'KlingAI' && !isEditing && !apiSecret.trim()) return setError(t('providerForm.errors.secretKeyRequired'));
    if (type === 'KlingAI' && isEditing && !apiSecret.trim() && !hasExistingSecret) return setError(t('providerForm.errors.secretKeyRequired'));
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        type,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(type === 'KlingAI' && apiSecret.trim() ? { apiSecret: apiSecret.trim() } : {}),
        apiUrl: apiUrl.trim() || null,
        concurrency,
      };
      if (isEditing) {
        await updateProvider(id!, payload);
        navigate(`/provider/${id}`);
      } else {
        await createProvider(payload as never);
        navigate('/providers');
      }
    } catch (err) {
      setError((err as Error)?.message || t('providerForm.errors.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const models = useMemo(() => PROVIDER_MODELS_MAP[type] || [], [type]);

  if (isLoading) return <LoadingState minHeight={400} />;

  return (
    <Page density="compact">
      <PageHeader
        backLink={{ label: t('providerForm.cancel'), onClick: leave }}
        title={isEditing ? t('providerForm.editTitle') : t('providerForm.newTitle')}
        description={t('providerForm.securityNote')}
        actions={
          <>
            <Button variant="text" onClick={leave}>
              {t('providerForm.cancel')}
            </Button>
            <Button variant="filled" icon="save" loading={isSubmitting} disabled={!name.trim()} onClick={() => void submit()} emphasized>
              {isEditing ? t('providerForm.submitSave') : t('providerForm.submitCreate')}
            </Button>
          </>
        }
      />

      <Section className="mb-6">
        {isEditing ? (
          <div className="flex">
            <span className="v2-provider-type" data-selected="">
              <ProviderLogo type={type} size={20} />
              <span>{type}</span>
            </span>
          </div>
        ) : (
          <div className="v2-provider-types" role="radiogroup" aria-label="Provider type">
            {PROVIDER_TYPES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={type === value}
                data-selected={type === value ? '' : undefined}
                className="v2-provider-type m3-focus-ring"
                onClick={() => setType(value)}
              >
                <Ripple />
                <ProviderLogo type={value} size={20} />
                <span>{value}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <form onSubmit={(e) => void submit(e)} autoComplete="off" className="flex h-fit flex-col gap-5">
          <Section variant="card">
            <TextField
              variant="outlined"
              label={t('providerForm.nameLabel')}
              value={name}
              onValueChange={setName}
              placeholder={t('providerForm.namePlaceholder')}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              required
              fullWidth
            />
            <SecretField
              label={type === 'KlingAI' ? t('providerForm.accessKeyLabel') : t('providerForm.apiKeyLabel')}
              value={apiKey}
              onChange={setApiKey}
              placeholder={isEditing && hasExistingKey ? t('providerForm.stored') : type === 'KlingAI' ? t('providerForm.accessKeyPlaceholder') : t('providerForm.apiKeyPlaceholder')}
              supporting={isEditing && hasExistingKey ? t('providerForm.leaveBlankToKeep') : undefined}
            />
            {type === 'KlingAI' && (
              <SecretField
                label={t('providerForm.secretKeyLabel')}
                value={apiSecret}
                onChange={setApiSecret}
                placeholder={isEditing && hasExistingSecret ? t('providerForm.stored') : t('providerForm.secretKeyPlaceholder')}
                supporting={isEditing && hasExistingSecret ? t('providerForm.leaveBlankToKeep') : undefined}
              />
            )}
            <TextField
              variant="outlined"
              type="url"
              label={t('providerForm.apiUrlLabel')}
              leadingIcon="public"
              value={apiUrl}
              onValueChange={setApiUrl}
              placeholder={t('providerForm.apiUrlPlaceholder')}
              supportingText={t('providerForm.apiUrlOptional')}
              autoComplete="off"
              spellCheck={false}
              inputClassName="font-mono"
              fullWidth
            />
            <NumberField
              label={`${t('providerForm.parallelTasksLabel')} · ${t('providerForm.maxRequests')}`}
              value={concurrency}
              onValueChange={setConcurrency}
              min={1}
              max={1000}
              integer
              stepper
              supportingText={t('providerForm.concurrencyLimit')}
              fullWidth
            />
          </Section>
          {error && <ErrorState message={error} />}
          <button type="submit" hidden />
        </form>

        <Section variant="card" title={t('providerForm.supportedModels')}>
          {models.length > 0 ? (
            <DataTable
              aria-label={t('providerForm.supportedModels')}
              density="compact"
              stickyHeader
              maxHeight={560}
              rows={models}
              getRowId={(m) => m.id}
              columns={[
                { key: 'name', header: t('common.name', 'Name'), cell: (m) => <Text variant="label-large" emphasized>{m.name}</Text> },
                { key: 'id', header: 'Model ID', cell: (m) => <span className="font-mono text-on-surface-variant">{m.modelId}</span>, hideBelow: 600 },
                { key: 'type', header: 'Type', width: 120, cell: (m) => <StatusPill icon={CATEGORY_ICON[m.category] ?? 'image'}>{m.category}</StatusPill> },
              ]}
            />
          ) : (
            <div className="v2-notice">
              <Icon name="info" />
              <Text variant="body-medium">{type === 'Civitai' ? t('providerForm.civitaiModelsNote') : 'No models listed for this provider yet.'}</Text>
            </div>
          )}
        </Section>
      </div>
    </Page>
  );
}
