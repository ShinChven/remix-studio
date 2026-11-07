import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Check, Hash, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { copyText, startResourceChat } from '../lib/resource-ref';

interface CopyRefButtonProps {
  /** The reference to copy, built with `resourceRef`. */
  reference: string;
  className?: string;
  iconClassName?: string;
}

/** Copies an item's AI reference in one click, without opening or selecting the item. */
export function CopyRefButton({ reference, className, iconClassName = 'w-3.5 h-3.5' }: CopyRefButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await copyText(reference);
      setCopied(true);
      toast.success(t('resourceRef.copied'), { description: reference });
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('resourceRef.copyFailed'), { description: reference });
    }
  };

  const label = t('resourceRef.copy');
  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      title={`${label}\n${reference}`}
      aria-label={label}
    >
      {copied ? <Check className={iconClassName} /> : <Hash className={iconClassName} />}
    </button>
  );
}

/** Starts a new Assistant chat pre-populated with an item's AI reference. */
export function StartChatRefButton({ reference, className, iconClassName = 'w-3.5 h-3.5' }: CopyRefButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const label = t('resourceRef.startChat');

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startResourceChat(navigate, reference);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      title={`${label}\n${reference}`}
      aria-label={label}
    >
      <MessageCircle className={iconClassName} />
    </button>
  );
}
