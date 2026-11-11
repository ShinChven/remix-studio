import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { batchSchedulePosts, batchSetPostText, type BatchScheduleItem } from '../../../api';
import { Button, Dialog, Text, TextField } from '../../../m3';
import { toDatetimeLocal } from '../../lib/posts';
import { useAction } from '../../lib/useAction';
import { useToast } from '../../ui/useToast';

interface BatchProps {
  postIds: string[];
  onClose: () => void;
  onComplete: () => void;
}

function defaultScheduleWindow() {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: toDatetimeLocal(start), end: toDatetimeLocal(end) };
}

/** Spreads posts evenly between two times, each moved by up to 10% of the gap so they don't land on a grid. */
function calculateSchedules(postIds: string[], start: Date, end: Date): BatchScheduleItem[] {
  if (postIds.length === 0) return [];
  if (postIds.length === 1) return [{ postId: postIds[0], scheduledAt: start.toISOString() }];
  const interval = (end.getTime() - start.getTime()) / (postIds.length - 1);
  const randomness = interval * 0.1;
  return postIds.map((postId, index) => ({ postId, scheduledAt: new Date(start.getTime() + index * interval + (Math.random() * 2 - 1) * randomness).toISOString() }));
}

/** Schedules several posts across a time window. */
export function BatchScheduleDialog({ postIds, onClose, onComplete }: BatchProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const action = useAction();
  const defaults = defaultScheduleWindow();
  const [startTime, setStartTime] = useState(defaults.start);
  const [endTime, setEndTime] = useState(defaults.end);
  const submitting = action.isBusy();

  const submit = async () => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!startTime || !endTime || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error(t('v2.campaigns.dialogs.pickBothTimes'));
      return;
    }
    if (end <= start) {
      toast.error(t('v2.campaigns.dialogs.endAfterStart'));
      return;
    }
    await action.run(
      async () => {
        const result = await batchSchedulePosts(calculateSchedules(postIds, start, end));
        if (result.skipped.length > 0) toast.info(t('v2.campaigns.dialogs.scheduledPartial', { done: result.updated, skipped: result.skipped.length, reason: result.skipped[0].reason }));
        else toast.success(t('v2.campaigns.dialogs.scheduled', { count: result.updated }));
        onComplete();
        onClose();
      },
      { error: t('v2.campaigns.dialogs.scheduleFailed') },
    );
  };

  return (
    <Dialog
      open
      onClose={() => !submitting && onClose()}
      icon="date_range"
      headline={t('v2.campaigns.dialogs.scheduleTitle')}
      maxWidth={480}
      actions={
        <>
          <Button variant="text" disabled={submitting} onClick={onClose}>
            {t('confirmModal.cancel', 'Cancel')}
          </Button>
          <Button variant="filled" loading={submitting} onClick={() => void submit()}>
            {t('v2.campaigns.dialogs.scheduleConfirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Text variant="body-medium" className="text-on-surface-variant">
          {t('v2.campaigns.dialogs.scheduleHint', { count: postIds.length })}
        </Text>
        <TextField variant="outlined" type="datetime-local" label={t('v2.campaigns.dialogs.startTime')} leadingIcon="event" required value={startTime} onValueChange={setStartTime} fullWidth />
        <TextField variant="outlined" type="datetime-local" label={t('v2.campaigns.dialogs.endTime')} leadingIcon="schedule" required value={endTime} onValueChange={setEndTime} fullWidth />
      </div>
    </Dialog>
  );
}

/** Replaces the text of several posts with the same text. */
export function BatchSetTextDialog({ postIds, onClose, onComplete }: BatchProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const action = useAction();
  const [text, setText] = useState('');
  const submitting = action.isBusy();

  const submit = () =>
    action.run(
      async () => {
        const result = await batchSetPostText(postIds, text);
        if (result.skipped.length > 0) toast.info(t('v2.campaigns.dialogs.textSetPartial', { done: result.updated, skipped: result.skipped.length, reason: result.skipped[0].reason }));
        else toast.success(t('v2.campaigns.dialogs.textSet', { count: result.updated }));
        onComplete();
        onClose();
      },
      { error: t('v2.campaigns.dialogs.setTextFailed') },
    );

  return (
    <Dialog
      open
      onClose={() => !submitting && onClose()}
      icon="text_fields"
      headline={t('v2.campaigns.dialogs.setTextTitle')}
      maxWidth={560}
      actions={
        <>
          <Button variant="text" disabled={submitting} onClick={onClose}>
            {t('confirmModal.cancel', 'Cancel')}
          </Button>
          <Button variant="filled" loading={submitting} disabled={!text.trim()} onClick={() => void submit()}>
            {t('v2.campaigns.dialogs.applyText')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Text variant="body-medium" className="text-on-surface-variant">
          {t('v2.campaigns.dialogs.setTextHint', { count: postIds.length })}
        </Text>
        <TextField
          variant="outlined"
          label={t('v2.campaigns.dialogs.postText')}
          multiline
          rows={6}
          maxRows={14}
          disabled={submitting}
          placeholder={t('v2.campaigns.dialogs.postTextPlaceholder')}
          value={text}
          onValueChange={setText}
          supportingText={t('v2.campaigns.dialogs.characters', { count: text.length })}
          data-autofocus
          fullWidth
        />
      </div>
    </Dialog>
  );
}
