import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssistantQuestion, AssistantQuestionAnswer } from '../../../api';
import { Button, cx, Icon, IconButton, Text } from '../../../m3';

export type QuestionReply = { answers: AssistantQuestionAnswer[] } | { skipped: true };

export interface QuestionPanelProps {
  questions: AssistantQuestion[];
  disabled?: boolean;
  onSubmit: (reply: QuestionReply) => void;
}

type Draft = { selected: string[]; other: string; otherOn: boolean };

const emptyDraft = (): Draft => ({ selected: [], other: '', otherOn: false });

function isAnswered(draft: Draft): boolean {
  return draft.selected.length > 0 || (draft.otherOn && draft.other.trim().length > 0);
}

/**
 * The assistant's open questions, shown inside the composer above its input.
 * One question at a time, with a tab per question when there are several.
 * Every question takes a free-text answer besides its options, and typing in
 * the composer below instead of answering replies to the assistant in prose.
 */
export function QuestionPanel({ questions, disabled = false, onSubmit }: QuestionPanelProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Draft[]>(() => questions.map(emptyDraft));
  const rootRef = useRef<HTMLElement>(null);
  const otherRef = useRef<HTMLInputElement>(null);

  const question = questions[Math.min(index, questions.length - 1)];
  const draft = drafts[index] ?? emptyDraft();
  const multi = question?.multiSelect === true;
  const isLast = index >= questions.length - 1;
  const allAnswered = drafts.every(isAnswered);

  // Bring the panel to the keyboard as soon as it opens, so 1–9 and Enter work.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  if (!question) return null;

  const update = (patch: Partial<Draft>) => {
    setDrafts((current) => current.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const toggleOption = (label: string) => {
    if (disabled) return;
    if (multi) {
      update({ selected: draft.selected.includes(label) ? draft.selected.filter((l) => l !== label) : [...draft.selected, label] });
      return;
    }
    const picked = draft.selected[0] === label && !draft.otherOn;
    update({ selected: picked ? [] : [label], otherOn: false });
    // A single choice is the whole answer: move on to the next question.
    if (!picked && !isLast) window.setTimeout(() => setIndex((i) => Math.min(i + 1, questions.length - 1)), 160);
  };

  const turnOnOther = () => {
    if (disabled) return;
    update(multi ? { otherOn: true } : { otherOn: true, selected: [] });
    window.setTimeout(() => otherRef.current?.focus(), 0);
  };

  const submit = () => {
    if (disabled || !allAnswered) return;
    onSubmit({
      answers: drafts.map((d) => ({
        selected: d.selected,
        ...(d.otherOn && d.other.trim() ? { other: d.other.trim() } : {}),
      })),
    });
  };

  const advance = () => {
    if (!isAnswered(draft)) return;
    if (isLast) submit();
    else setIndex(index + 1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const inField = event.target instanceof HTMLInputElement;
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      if (inField || event.target === rootRef.current) {
        event.preventDefault();
        advance();
      }
      return;
    }
    if (inField) return;
    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1) {
      if (digit <= question.options.length) {
        event.preventDefault();
        toggleOption(question.options[digit - 1].label);
      } else if (digit === question.options.length + 1) {
        event.preventDefault();
        turnOnOther();
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-question-row]') ?? []);
      if (rows.length === 0) return;
      event.preventDefault();
      const current = rows.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'ArrowDown'
        ? (current + 1) % rows.length
        : (current <= 0 ? rows.length - 1 : current - 1);
      rows[next].focus();
    }
  };

  return (
    <section
      ref={rootRef}
      className="v2-question"
      tabIndex={-1}
      aria-label={t('v2.assistant.question.label', 'Question from the assistant')}
      onKeyDown={onKeyDown}
    >
      <div className="v2-question__head">
        <Icon name="help" size={20} className="v2-question__icon" />
        {questions.length > 1 ? (
          <div className="v2-question__tabs" role="tablist" aria-label={t('v2.assistant.question.tabs', 'Questions')}>
            {questions.map((q, i) => {
              const answered = isAnswered(drafts[i] ?? emptyDraft());
              return (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  className="v2-question__tab m3-focus-ring"
                  data-answered={answered ? '' : undefined}
                  onClick={() => setIndex(i)}
                >
                  {answered && <Icon name="check" size={16} />}
                  <span className="v2-ellipsis">
                    {q.header || t('v2.assistant.question.numbered', { number: i + 1, defaultValue: 'Question {{number}}' })}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <Text variant="label-large" className="v2-question__kicker v2-ellipsis">
            {question.header || t('v2.assistant.question.kicker', 'The assistant needs your input')}
          </Text>
        )}
        <IconButton
          icon="close"
          label={t('v2.assistant.question.skip', 'Skip')}
          tooltip
          size="xs"
          disabled={disabled}
          onClick={() => onSubmit({ skipped: true })}
          className="v2-question__close"
        />
      </div>

      <Text as="p" variant="title-medium" className="v2-question__title">{question.question}</Text>
      {multi && (
        <Text as="p" variant="body-small" className="v2-question__hint">
          {t('v2.assistant.question.multiHint', 'Choose all that apply')}
        </Text>
      )}

      <div
        className="v2-question__options"
        role={multi ? 'group' : 'radiogroup'}
        aria-label={question.question}
      >
        {question.options.map((option, i) => {
          const checked = draft.selected.includes(option.label);
          return (
            <button
              key={option.label}
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={checked}
              data-question-row=""
              className="v2-question__option m3-focus-ring"
              disabled={disabled}
              onClick={() => toggleOption(option.label)}
            >
              <span className="v2-question__marker" data-shape={multi ? 'square' : 'round'} aria-hidden>
                {checked ? <Icon name="check" size={18} /> : i + 1}
              </span>
              <span className="v2-question__text">
                <Text as="span" variant="label-large" className="v2-question__label">{option.label}</Text>
                {option.description && (
                  <Text as="span" variant="body-small" className="v2-question__description">{option.description}</Text>
                )}
              </span>
            </button>
          );
        })}

        <div
          className={cx('v2-question__option', 'v2-question__other')}
          data-active={draft.otherOn ? '' : undefined}
        >
          <span className="v2-question__marker" data-shape={multi ? 'square' : 'round'} aria-hidden>
            {draft.otherOn && draft.other.trim() ? <Icon name="check" size={18} /> : <Icon name="edit" size={16} />}
          </span>
          <input
            ref={otherRef}
            type="text"
            data-question-row=""
            className="v2-question__other-input"
            value={draft.other}
            disabled={disabled}
            maxLength={2000}
            placeholder={t('v2.assistant.question.otherPlaceholder', 'Something else…')}
            aria-label={t('v2.assistant.question.other', 'Your own answer')}
            onFocus={() => {
              if (!draft.otherOn) update(multi ? { otherOn: true } : { otherOn: true, selected: [] });
            }}
            onChange={(event) => update(multi ? { other: event.target.value, otherOn: true } : { other: event.target.value, otherOn: true, selected: [] })}
          />
        </div>
      </div>

      <div className="v2-question__foot">
        <Text as="span" variant="body-small" className="v2-question__keys">
          {t('v2.assistant.question.keys', 'Press a number to choose · Enter to continue · or type a reply below')}
        </Text>
        <div className="v2-question__actions">
          {index > 0 && (
            <Button variant="text" size="sm" disabled={disabled} onClick={() => setIndex(index - 1)}>
              {t('v2.assistant.question.back', 'Back')}
            </Button>
          )}
          {isLast ? (
            <Button variant="filled" size="sm" icon="send" disabled={disabled || !allAnswered} onClick={submit}>
              {t('v2.assistant.question.submit', 'Submit')}
            </Button>
          ) : (
            <Button variant="filled" size="sm" trailingIcon="arrow_forward" disabled={disabled || !isAnswered(draft)} onClick={() => setIndex(index + 1)}>
              {t('v2.assistant.question.next', 'Next')}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

/** How an answered `ask_user` call reads in the transcript. */
export function QuestionSummary({
  questions,
  result,
}: {
  questions: AssistantQuestion[];
  result: unknown;
}) {
  const { t } = useTranslation();
  const payload = (result && typeof result === 'object' ? result : {}) as {
    answers?: { question?: string; selected?: string[]; other?: string; skipped?: boolean }[];
    skipped?: boolean;
    dismissed?: boolean;
  };
  const answers = Array.isArray(payload.answers) ? payload.answers : [];
  const status = payload.dismissed
    ? t('v2.assistant.question.dismissed', 'Answered in chat')
    : payload.skipped
      ? t('v2.assistant.question.skipped', 'Skipped')
      : null;

  return (
    <div className="v2-question-summary">
      {questions.map((q, i) => {
        const answer = answers[i];
        const picks = [...(answer?.selected ?? []), ...(answer?.other ? [answer.other] : [])];
        return (
          <div key={i} className="v2-question-summary__row">
            <Icon name="help" size={16} className="v2-question-summary__icon" />
            <div className="v2-question-summary__body">
              <Text as="span" variant="body-small" className="v2-question-summary__question">{q.question}</Text>
              <span className="v2-question-summary__answers">
                {picks.length > 0
                  ? picks.map((pick, j) => (
                      <Text key={j} as="span" variant="label-medium" className="v2-question-summary__answer">{pick}</Text>
                    ))
                  : (
                      <Text as="span" variant="label-medium" className="v2-question-summary__status">
                        {status ?? t('v2.assistant.question.skipped', 'Skipped')}
                      </Text>
                    )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
