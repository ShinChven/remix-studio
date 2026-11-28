import { useTranslation } from 'react-i18next';
import type { AssistantStepItem, AssistantStepStatus } from '../../../api';

export interface StepTrackerProps {
  steps: AssistantStepItem[];
  /** True while the turn is running or paused awaiting user action, so the active step animates. */
  active?: boolean;
}

function StepIcon({ status, active }: { status: AssistantStepStatus; active: boolean }) {
  if (status === 'done') {
    return (
      <svg className="v2-step-tracker__icon" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
        <circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.35" />
        <path
          d="M5.9 9.2L8.05 11.35L12.3 6.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (status === 'in_progress') {
    return (
      <svg
        className="v2-step-tracker__icon v2-step-tracker__dots"
        data-active={active ? '' : undefined}
        viewBox="0 0 18 18"
        width="18"
        height="18"
        aria-hidden="true"
      >
        <circle className="v2-step-tracker__dot v2-step-tracker__dot--1" cx="6.2" cy="6.2" r="1.9" fill="currentColor" />
        <circle className="v2-step-tracker__dot v2-step-tracker__dot--2" cx="11.8" cy="6.2" r="1.9" fill="currentColor" />
        <circle className="v2-step-tracker__dot v2-step-tracker__dot--3" cx="11.8" cy="11.8" r="1.9" fill="currentColor" />
        <circle className="v2-step-tracker__dot v2-step-tracker__dot--4" cx="6.2" cy="11.8" r="1.9" fill="currentColor" />
      </svg>
    );
  }

  if (status === 'failed') {
    return (
      <svg className="v2-step-tracker__icon" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
        <circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.35" />
        <path
          d="M6.5 6.5L11.5 11.5M11.5 6.5L6.5 11.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (status === 'skipped') {
    return (
      <svg className="v2-step-tracker__icon" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
        <circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.35" strokeDasharray="2.5 2.2" />
        <path d="M6.2 9H11.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className="v2-step-tracker__icon" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}

/**
 * Compact checklist card rendered inside the assistant transcript when a turn
 * runs a multi-step task via `update_steps`.
 */
export function StepTracker({ steps, active = false }: StepTrackerProps) {
  const { t } = useTranslation();

  if (steps.length === 0) return null;

  const statusLabel = (status: AssistantStepStatus) => {
    switch (status) {
      case 'done':
        return t('v2.assistant.steps.done', 'Completed');
      case 'in_progress':
        return t('v2.assistant.steps.inProgress', 'In progress');
      case 'failed':
        return t('v2.assistant.steps.failed', 'Failed');
      case 'skipped':
        return t('v2.assistant.steps.skipped', 'Skipped');
      default:
        return t('v2.assistant.steps.pending', 'Pending');
    }
  };

  return (
    <div
      className="v2-step-tracker"
      role="list"
      aria-label={t('v2.assistant.steps.label', 'Task progress')}
    >
      {steps.map((step, index) => (
        <div
          key={`${index}-${step.title}`}
          className="v2-step-tracker__item"
          data-status={step.status}
          role="listitem"
          aria-label={`${step.title} — ${statusLabel(step.status)}`}
        >
          <span className="v2-step-tracker__glyph">
            <StepIcon status={step.status} active={active} />
          </span>
          <span className="v2-step-tracker__title">{step.title}</span>
        </div>
      ))}
    </div>
  );
}
