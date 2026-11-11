import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { IconButton, type ButtonSize, type IconButtonVariant } from '../../m3';
import { copyText, startResourceChat } from '../../lib/resource-ref';
import { useToast } from '../ui/useToast';

/** Copies an item's AI reference (built with `resourceRef`) without opening or selecting the item. */
export function CopyRefButton({ reference, size = 'xs', variant = 'standard', className }: { reference: string; size?: ButtonSize; variant?: IconButtonVariant; className?: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <IconButton
      icon={copied ? 'check' : 'tag'}
      label={t('resourceRef.copy')}
      tooltip
      size={size}
      variant={variant}
      className={className}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await copyText(reference);
          setCopied(true);
          toast.success(`${t('resourceRef.copied')} · ${reference}`);
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error(`${t('resourceRef.copyFailed')} · ${reference}`);
        }
      }}
    />
  );
}

/** Starts a new Assistant chat pre-populated with an item's AI reference. */
export function StartChatRefButton({ reference, size = 'xs', variant = 'standard', className }: { reference: string; size?: ButtonSize; variant?: IconButtonVariant; className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <IconButton
      icon="chat"
      label={t('resourceRef.startChat')}
      tooltip
      size={size}
      variant={variant}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startResourceChat(navigate, reference);
      }}
    />
  );
}
