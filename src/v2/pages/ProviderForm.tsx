import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createProvider, fetchProvider, updateProvider } from '../../api';
import { Button, Icon, IconButton, Ripple, Shape, Text, TextField, useSnackbar } from '../../m3';
import { PROVIDER_MODELS_MAP, type ProviderType } from '../../types';
import { ModelRows, useModelEntries } from '../components/providers/ModelRows';
import { ProviderHero } from '../components/providers/ProviderHero';
import { ProviderMark } from '../components/providers/ProviderMark';
import { KEY_PAGES, modelsByKind, SERVICE_TYPES, serviceKinds, serviceMeta } from '../components/providers/providerMeta';
import { kindMeta } from '../ui/entityMeta';
import { NumberField } from '../ui/NumberField';
import { ErrorState, LoadingState, Page } from '../ui/Page';

/** A secret field that never offers itself to password managers: masked text, not a password. */
function SecretField({ label, value, onChange, placeholder, supporting }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; supporting?: string }) {
  const { t } = useTranslation();
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
      trailingIcon={<IconButton icon={shown ? 'visibility_off' : 'visibility'} label={shown ? t('v2.providers.form.hideKey') : t('v2.providers.form.showKey')} size="xs" onClick={() => setShown((s) => !s)} />}
      fullWidth
    />
  );
}

/** A numbered step of the form: its number on a shape, its title and a hint. */
function StepHead({ number, title, hint }: { number?: number; title: string; hint: string }) {
  return (
    <div className="v2-form-step__head">
      {number !== undefined && (
        <span className="v2-form-step__number" aria-hidden>
          <Shape name="cookie-9" size={32} morph={false} />
          <span>{number}</span>
        </span>
      )}
      <div className="v2-form-step__titles">
        <Text as="h2" variant="title-medium" emphasized>
          {title}
        </Text>
        <Text as="span" variant="body-small" className="v2-form-step__hint">
          {hint}
        </Text>
      </div>
    </div>
  );
}

/** One service to pick: its mark (morphing while chosen), its name and what it makes. */
function ServiceOption({ type, selected, onSelect }: { type: ProviderType; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-selected={selected ? '' : undefined}
      className="v2-service-option m3-focus-ring"
      onClick={onSelect}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <Ripple />
      <ProviderMark type={type} size={40} active={selected || hover} />
      <span className="v2-service-option__text">
        <span className="v2-service-option__name">{serviceMeta(type).label}</span>
        <span className="v2-service-option__kinds">
          {serviceKinds(type).map((kind) => (
            <Icon key={kind} name={kindMeta(kind).icon} size={13} filled data-kind={kind} aria-label={t(`v2.providers.kind.${kind}`)} />
          ))}
        </span>
      </span>
      {selected && <Icon name="check_circle" size={20} filled className="v2-service-option__check" />}
    </button>
  );
}

export function ProviderForm() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedType = searchParams.get('type') as ProviderType | null;
  const initialType = requestedType && SERVICE_TYPES.includes(requestedType) ? requestedType : 'GoogleAI';

  const [name, setName] = useState(isEditing ? '' : serviceMeta(initialType).label);
  // Until it is typed, the name of a new provider follows the service.
  const [nameTouched, setNameTouched] = useState(false);
  const [savedName, setSavedName] = useState('');
  const [type, setType] = useState<ProviderType>(initialType);
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
        setSavedName(p.name);
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

  const service = serviceMeta(type);
  const leave = () => navigate(isEditing ? `/provider/${id}` : '/providers');

  const chooseType = (next: ProviderType) => {
    setType(next);
    setError(null);
    if (!nameTouched) setName(serviceMeta(next).label);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || isSubmitting) return;
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
        snackbar.show(t('v2.providers.form.saved'));
        navigate(`/provider/${id}`);
      } else {
        const createdId = await createProvider(payload as never);
        snackbar.show({ message: t('v2.providers.form.connected', { name: payload.name }), action: { label: t('v2.providers.open'), onClick: () => navigate(`/provider/${createdId}`) } });
        navigate('/providers');
      }
    } catch (err) {
      setError((err as Error)?.message || t('providerForm.errors.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const configs = useMemo(() => PROVIDER_MODELS_MAP[type] || [], [type]);
  const models = useModelEntries(configs);
  const groups = modelsByKind(models);

  const copy = (text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => snackbar.show(t('v2.providers.copied')))
      .catch(() => snackbar.show(t('v2.providers.copyFailed')));
  };

  if (isLoading) return <LoadingState minHeight={400} />;

  const kling = type === 'KlingAI';

  return (
    <Page className="v2-provider-page v2-provider-form" density="compact">
      <ProviderHero
        type={type}
        backLink={isEditing ? { to: `/provider/${id}`, label: savedName || t('providers.title') } : { to: '/providers', label: t('providers.title') }}
        kicker={isEditing ? service.label : t('v2.providers.form.newKicker')}
        title={isEditing ? t('v2.providers.form.editTitle', { name: savedName }) : service.label}
        description={isEditing ? undefined : t('v2.providers.form.newDescription')}
        badges={
          <span className="v2-provider-hero__kinds">
            {serviceKinds(type).map((kind) => (
              <span key={kind} className="v2-provider-kind" data-kind={kind}>
                <Icon name={kindMeta(kind).icon} size={15} filled aria-hidden />
                <span className="v2-provider-kind__label">{t(`v2.providers.kind.${kind}`)}</span>
              </span>
            ))}
          </span>
        }
      />

      <div className="v2-provider-form__layout">
        <form className="v2-provider-form__main" onSubmit={(e) => void submit(e)} autoComplete="off">
          {!isEditing && (
            <section className="v2-form-step">
              <StepHead number={1} title={t('v2.providers.form.stepService')} hint={t('v2.providers.form.stepServiceHint')} />
              <div className="v2-service-picker" role="radiogroup" aria-label={t('v2.providers.form.stepService')}>
                {SERVICE_TYPES.map((value) => (
                  <ServiceOption key={value} type={value} selected={type === value} onSelect={() => chooseType(value)} />
                ))}
              </div>
            </section>
          )}

          <section className="v2-form-step">
            <StepHead number={isEditing ? undefined : 2} title={t('v2.providers.form.stepKey')} hint={t('v2.providers.form.stepKeyHint')} />
            <div className="v2-form-card">
              <TextField
                variant="outlined"
                label={t('providerForm.nameLabel')}
                value={name}
                onValueChange={(value) => {
                  setName(value);
                  setNameTouched(true);
                }}
                placeholder={t('providerForm.namePlaceholder')}
                supportingText={t('v2.providers.form.nameHint')}
                autoComplete="off"
                spellCheck={false}
                required
                fullWidth
              />
              <SecretField
                label={kling ? t('providerForm.accessKeyLabel') : t('providerForm.apiKeyLabel')}
                value={apiKey}
                onChange={setApiKey}
                placeholder={isEditing && hasExistingKey ? t('providerForm.stored') : kling ? t('providerForm.accessKeyPlaceholder') : t('providerForm.apiKeyPlaceholder')}
                supporting={isEditing && hasExistingKey ? t('v2.providers.form.keyStored') : undefined}
              />
              {kling && (
                <SecretField
                  label={t('providerForm.secretKeyLabel')}
                  value={apiSecret}
                  onChange={setApiSecret}
                  placeholder={isEditing && hasExistingSecret ? t('providerForm.stored') : t('providerForm.secretKeyPlaceholder')}
                  supporting={isEditing && hasExistingSecret ? t('v2.providers.form.secretStored') : undefined}
                />
              )}
              <a className="v2-key-link m3-focus-ring" href={KEY_PAGES[type]} target="_blank" rel="noopener noreferrer">
                <Icon name="open_in_new" size={16} aria-hidden />
                {t('v2.providers.form.getKey', { service: service.label })}
              </a>
            </div>
          </section>

          <section className="v2-form-step">
            <StepHead number={isEditing ? undefined : 3} title={t('v2.providers.form.stepRequests')} hint={t('v2.providers.form.stepRequestsHint')} />
            <div className="v2-form-card v2-form-card--split">
              <NumberField
                label={t('v2.providers.parallel')}
                value={concurrency}
                onValueChange={setConcurrency}
                min={1}
                max={1000}
                integer
                stepper
                leadingIcon="speed"
                supportingText={t('v2.providers.form.parallelHint')}
                fullWidth
              />
              <TextField
                variant="outlined"
                type="url"
                label={t('providerForm.apiUrlLabel')}
                leadingIcon="public"
                value={apiUrl}
                onValueChange={setApiUrl}
                placeholder={t('providerForm.apiUrlPlaceholder')}
                supportingText={t('v2.providers.form.apiUrlHint', { service: service.label })}
                autoComplete="off"
                spellCheck={false}
                inputClassName="font-mono"
                fullWidth
              />
            </div>
          </section>

          {error && <ErrorState message={error} />}
          <button type="submit" hidden />

          <div className="v2-provider-form__bar">
            <Button variant="text" onClick={leave}>
              {t('providerForm.cancel')}
            </Button>
            <Button variant="filled" size="md" icon={isEditing ? 'save' : 'link'} loading={isSubmitting} disabled={!name.trim()} onClick={() => void submit()} emphasized>
              {isEditing ? t('v2.providers.form.saveChanges') : t('v2.providers.form.connect', { service: service.label })}
            </Button>
          </div>
        </form>

        <aside className="v2-provider-form__aside" aria-label={t('v2.providers.form.makes', { service: service.label })}>
          <div className="v2-provider-form__aside-head">
            <Text as="h2" variant="title-medium" emphasized>
              {t('v2.providers.form.makes', { service: service.label })}
            </Text>
            {models.length > 0 && (
              <Text as="span" variant="body-small" className="v2-form-step__hint">
                {t('v2.providers.form.modelCount', { count: models.length })}
              </Text>
            )}
          </div>
          {groups.length > 0 ? (
            groups.map((group) => (
              <section key={group.kind} className="v2-model-group" data-kind={group.kind}>
                <Text as="h3" variant="label-large" emphasized className="v2-model-group__title">
                  <Icon name={kindMeta(group.kind).icon} size={16} filled aria-hidden />
                  {t(`v2.providers.kinds.${group.kind}`)}
                  <span className="v2-model-group__count">{group.models.length}</span>
                </Text>
                <ModelRows models={group.models} onCopy={copy} compact />
              </section>
            ))
          ) : (
            <div className="v2-notice">
              <Icon name="info" />
              <Text variant="body-medium">{type === 'Civitai' ? t('providerForm.civitaiModelsNote') : t('v2.providers.form.noModels')}</Text>
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}
