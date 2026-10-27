import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ButtonGroup, Dialog, IconButton, Text, TextField } from '../../../m3';
import type { User, UserRole, UserStatus } from '../../../types';
import { formatBytes } from '../../lib/format';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { ChoiceTiles } from '../../ui/ChoiceTiles';
import { generatePassword, STORAGE_TIERS, type StorageTierKey } from './userMeta';

/** A password field with buttons to generate a strong password and to copy it. */
function PasswordField({ label, value, onChange, required, supportingText, onCopy }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; supportingText?: string; onCopy: (text: string) => void }) {
  const { t } = useTranslation();
  const tooShort = value.length > 0 && value.length < 8;
  return (
    <div className="v2-user-password">
      <TextField
        variant="outlined"
        type="password"
        minLength={8}
        required={required}
        label={label}
        value={value}
        onValueChange={onChange}
        passwordToggle
        autoComplete="new-password"
        supportingText={supportingText}
        error={tooShort}
        errorText={t('v2.users.passwordTooShort')}
        fullWidth
      />
      <IconButton icon="password" variant="tonal" label={t('v2.users.generatePassword')} tooltip onClick={() => onChange(generatePassword())} />
      <IconButton icon="content_copy" label={t('v2.users.copyPassword')} tooltip disabled={!value} onClick={() => onCopy(value)} />
    </div>
  );
}

export interface CreateUserDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { email: string; password: string; role: UserRole; status: UserStatus; storageLimit: number }) => Promise<User | null>;
  onCopy: (text: string) => void;
}

/** Creates an account: email, an optional password, its role, whether it can sign in yet, and its storage. */
export function CreateUserDialog({ open, onClose, onCreate, onCopy }: CreateUserDialogProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [status, setStatus] = useState<UserStatus>('disabled');
  const [tier, setTier] = useState<StorageTierKey>('free');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setPassword('');
    setRole('user');
    setStatus('disabled');
    setTier('free');
  }, [open]);

  const valid = /\S+@\S+\.\S+/.test(email.trim()) && (password.length === 0 || password.length >= 8);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const created = await onCreate({ email: email.trim(), password, role, status, storageLimit: STORAGE_TIERS.find((option) => option.key === tier)!.bytes });
    setBusy(false);
    if (created) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      icon="person_add"
      headline={t('adminUsers.createModal.title')}
      maxWidth={600}
      fullScreen="compact"
      dismissible={!busy && !email && !password}
      confirmAction={
        <Button variant="text" loading={busy} disabled={!valid} onClick={() => void submit()}>
          {t('adminUsers.createModal.submit')}
        </Button>
      }
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={busy}>
            {t('adminUsers.createModal.cancel')}
          </Button>
          <Button variant="filled" icon="person_add" loading={busy} disabled={!valid} onClick={() => void submit()}>
            {t('adminUsers.createModal.submit')}
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="v2-user-form" data-density="compact">
        <TextField variant="outlined" type="email" required autoComplete="off" label={t('adminUsers.createModal.email')} value={email} onValueChange={setEmail} leadingIcon="mail" fullWidth data-autofocus />
        <PasswordField label={t('v2.users.create.password')} value={password} onChange={setPassword} supportingText={t('v2.users.create.passwordHint')} onCopy={onCopy} />

        <div className="v2-user-form__field">
          <Text as="span" variant="label-large" className="text-on-surface-variant">
            {t('adminUsers.createModal.role')}
          </Text>
          <ButtonGroup variant="connected" selection="single" value={role} onChange={(next) => next && setRole(next as UserRole)} aria-label={t('adminUsers.createModal.role')}>
            <Button value="user" icon="person">
              {t('adminUsers.user')}
            </Button>
            <Button value="admin" icon="shield_person">
              {t('adminUsers.admin')}
            </Button>
          </ButtonGroup>
        </div>

        <div className="v2-user-form__field">
          <Text as="span" variant="label-large" className="text-on-surface-variant">
            {t('v2.users.create.access')}
          </Text>
          <ChoiceTiles<UserStatus>
            aria-label={t('v2.users.create.access')}
            columns={2}
            size="compact"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', icon: 'check_circle', label: t('adminUsers.active'), supportingText: t('v2.users.create.activeHint') },
              { value: 'disabled', icon: 'pause_circle', label: t('adminUsers.disabled'), supportingText: t('v2.users.create.disabledHint') },
            ]}
          />
        </div>

        <div className="v2-user-form__field">
          <Text as="span" variant="label-large" className="text-on-surface-variant">
            {t('adminUsers.createModal.storage')}
          </Text>
          <ChoiceChips<StorageTierKey>
            aria-label={t('adminUsers.createModal.storage')}
            value={tier}
            onChange={setTier}
            options={STORAGE_TIERS.map((option) => ({ value: option.key, label: t('v2.users.tierLabel', { tier: t(`v2.users.tiers.${option.key}`), size: formatBytes(option.bytes) }) }))}
          />
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export interface ResetPasswordDialogProps {
  /** The account whose password is reset; the dialog is open while set. */
  email: string | null;
  onClose: () => void;
  onReset: (password: string) => Promise<boolean>;
  onCopy: (text: string) => void;
}

/** Sets a new password for someone else's account. */
export function ResetPasswordDialog({ email, onClose, onReset, onCopy }: ResetPasswordDialogProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (email) setPassword('');
  }, [email]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (password.length < 8 || busy) return;
    setBusy(true);
    const done = await onReset(password);
    setBusy(false);
    if (done) onClose();
  };

  return (
    <Dialog
      open={email !== null}
      onClose={() => !busy && onClose()}
      icon="key"
      headline={t('adminUsers.detail.passwordReset')}
      maxWidth={480}
      dismissible={!busy && !password}
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={busy}>
            {t('adminUsers.createModal.cancel')}
          </Button>
          <Button variant="filled" icon="key" loading={busy} disabled={password.length < 8} onClick={() => void submit()}>
            {t('adminUsers.detail.resetSubmit')}
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="v2-user-form" data-density="compact">
        <Text variant="body-medium" className="text-on-surface-variant">
          {t('v2.users.reset.message', { email: email ?? '' })}
        </Text>
        <PasswordField label={t('adminUsers.detail.newPassword')} value={password} onChange={setPassword} required onCopy={onCopy} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
