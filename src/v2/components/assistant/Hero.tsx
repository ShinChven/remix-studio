import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Shape } from '../../../m3';
import { ScrambleText } from '../../ui/ScrambleText';
import { Composer, type ComposerProps } from './Composer';

/** Start screen of a conversation: a cycling greeting over an expressive shape, then the composer. */
export function AssistantHero({ className, interval = 8000, ...composer }: ComposerProps & { className?: string; interval?: number }) {
  const { t } = useTranslation();
  const greetings = useMemo(
    () => [
      t('assistant.greetings.0', 'What do you have in mind?'),
      t('assistant.greetings.1', 'What do you want to create today?'),
      t('assistant.greetings.2', 'How can I assist your workflow?'),
      t('assistant.greetings.3', 'Ready to make some magic happen?'),
      t('assistant.greetings.4', 'Follow the white rabbit.'),
      t('assistant.greetings.5', 'Red pill or blue pill?'),
      t('assistant.greetings.6', 'There is no spoon.'),
      t('assistant.greetings.7', 'Wake up, Neo...'),
      t('assistant.greetings.8', 'Welcome to the Desert of the Real.'),
      t('assistant.greetings.9', "You're absolutely right!"),
    ],
    [t],
  );
  return (
    <div className={`v2-hero ${className ?? ''}`}>
      <div className="v2-hero__art" aria-hidden>
        <Shape name="soft-burst" size={72} className="v2-hero__shape" />
        <span className="material-symbols-outlined v2-hero__glyph">auto_awesome</span>
      </div>
      <h2 className="v2-hero__greeting m3-typescale-emphasized-headline-medium">
        <ScrambleText texts={greetings} interval={interval} />
      </h2>
      <Composer {...composer} variant="hero" />
    </div>
  );
}
