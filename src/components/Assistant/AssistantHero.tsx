import React from 'react';
import { useTranslation } from 'react-i18next';
import { MatrixText } from '../MatrixText';
import { AssistantComposer, AssistantComposerProps } from './AssistantComposer';

interface AssistantHeroProps extends AssistantComposerProps {
  className?: string;
  interval?: number;
}

export const AssistantHero: React.FC<AssistantHeroProps> = ({ 
  className, 
  interval = 8000,
  ...composerProps 
}) => {
  const { t } = useTranslation();

  const greetings = [
    t('assistant.greetings.0', 'What do you have in mind?'),
    t('assistant.greetings.1', 'What do you want to create today?'),
    t('assistant.greetings.2', 'How can I assist your workflow?'),
    t('assistant.greetings.3', 'Ready to make some magic happen?'),
    t('assistant.greetings.4', 'Follow the white rabbit.'),
    t('assistant.greetings.5', 'Red pill or blue pill?'),
    t('assistant.greetings.6', 'There is no spoon.'),
    t('assistant.greetings.7', 'Wake up, Neo...'),
    t('assistant.greetings.8', 'Welcome to the Desert of the Real.'),
    t('assistant.greetings.9', "You're absolutely right!")
  ];

  return (
    <div className={`w-full max-w-2xl mx-auto ${className}`}>
      <h2 className="text-2xl md:text-3xl font-semibold text-center text-neutral-800 dark:text-neutral-200 mb-12 md:mb-16 h-[4rem] md:h-[4.5rem] flex items-center justify-center">
        <div className="w-full">
          <MatrixText texts={greetings} interval={interval} />
        </div>
      </h2>
      <AssistantComposer {...composerProps} />
    </div>
  );
};
