import { useState } from 'react';
import { batchSchedulePosts, batchSetPostText, type BatchScheduleItem } from '../../../api';
import { Button, Dialog, Text, TextField } from '../../../m3';
import { toDatetimeLocal } from '../../lib/posts';
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
  const toast = useToast();
  const defaults = defaultScheduleWindow();
  const [startTime, setStartTime] = useState(defaults.start);
  const [endTime, setEndTime] = useState(defaults.end);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!startTime || !endTime) {
      toast.error('Please select both start and end times');
      return;
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('Invalid date');
      return;
    }
    if (end <= start) {
      toast.error('End time must be after start time');
      return;
    }
    try {
      setSubmitting(true);
      const result = await batchSchedulePosts(calculateSchedules(postIds, start, end));
      if (result.skipped.length > 0) toast.info(`Scheduled ${result.updated}. Skipped ${result.skipped.length}: ${result.skipped[0].reason}${result.skipped.length > 1 ? '…' : ''}`);
      else toast.success(`Scheduled ${result.updated} post${result.updated === 1 ? '' : 's'}`);
      onComplete();
      onClose();
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to schedule posts');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => !submitting && onClose()}
      icon="date_range"
      headline="Batch Schedule Posts"
      maxWidth={480}
      actions={
        <>
          <Button variant="text" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" loading={submitting} onClick={() => void submit()}>
            Confirm Schedule
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Text variant="body-medium" className="text-on-surface-variant">
          Distribute {postIds.length} post{postIds.length === 1 ? '' : 's'} between the selected start and end times with 10% randomness.
        </Text>
        <TextField variant="outlined" type="datetime-local" label="Start Date & Time" leadingIcon="event" required value={startTime} onValueChange={setStartTime} fullWidth />
        <TextField variant="outlined" type="datetime-local" label="End Date & Time" leadingIcon="schedule" required value={endTime} onValueChange={setEndTime} fullWidth />
      </div>
    </Dialog>
  );
}

/** Replaces the text of several posts with the same text. */
export function BatchSetTextDialog({ postIds, onClose, onComplete }: BatchProps) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!text.trim()) {
      toast.error('Enter the text to apply');
      return;
    }
    try {
      setSubmitting(true);
      const result = await batchSetPostText(postIds, text);
      if (result.skipped.length > 0) toast.info(`Updated ${result.updated}. Skipped ${result.skipped.length}: ${result.skipped[0].reason}${result.skipped.length > 1 ? '…' : ''}`);
      else toast.success(`Updated text for ${result.updated} post${result.updated === 1 ? '' : 's'}`);
      onComplete();
      onClose();
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to set post text');
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => !submitting && onClose()}
      icon="text_fields"
      headline="Set Post Text"
      maxWidth={560}
      actions={
        <>
          <Button variant="text" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="filled" loading={submitting} disabled={!text.trim()} onClick={() => void submit()}>
            {submitting ? 'Applying...' : 'Apply Text'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Text variant="body-medium" className="text-on-surface-variant">
          Apply the same text to {postIds.length} selected post{postIds.length === 1 ? '' : 's'}. Existing text on those posts is replaced.
        </Text>
        <TextField
          variant="outlined"
          label="Post Text"
          multiline
          rows={6}
          maxRows={14}
          disabled={submitting}
          placeholder="e.g., New drop is live. Link in bio. #launch"
          value={text}
          onValueChange={setText}
          supportingText={`${text.length} characters`}
          data-autofocus
          fullWidth
        />
      </div>
    </Dialog>
  );
}
