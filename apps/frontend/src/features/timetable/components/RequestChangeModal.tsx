import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createChangeRequest } from '../../../api/schedule-change-request.api';
import Modal from '../../../components/ui/Modal';
import { useFeedback } from '../../../components/ui/FeedbackToast';
import { extractApiError } from '../../../lib/api-error';
import type { ScheduleEntry } from '../types';

export interface RequestChangeModalProps {
  open: boolean;
  entry: ScheduleEntry | null;
  onClose: () => void;
  onSubmitted?: () => void;
}

/**
 * DH → Dean change request for the head's own review/finalized entries.
 *
 * Reused by the schedule detail drawer and the class-block quick action so
 * both entry points file the same structured request.
 */
export default function RequestChangeModal({
  open,
  entry,
  onClose,
  onSubmitted,
}: RequestChangeModalProps) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [reason, setReason] = useState('');

  useEffect(() => {
    setReason('');
  }, [entry?.id]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!entry) throw new Error('No schedule entry selected');
      return createChangeRequest(entry.id, reason.trim());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-change-requests'] });
      if (entry) {
        queryClient.invalidateQueries({
          queryKey: ['schedule-change-request', entry.id],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['schedule-publish-requests'] });
      queryClient.invalidateQueries({
        queryKey: ['schedule-unfinalize-requests'],
      });
      queryClient.invalidateQueries({ queryKey: ['coverage'] });
      queryClient.invalidateQueries({ queryKey: ['flagged'] });
      feedback.success('Change request sent to the Dean.');
      onSubmitted?.();
      onClose();
    },
    onError: (err: unknown) => {
      feedback.failed(extractApiError(err, 'Change request failed'));
    },
  });

  const tooShort = reason.trim().length < 5;
  const tooLong = reason.trim().length > 500;
  const canSubmit = !!entry && !tooShort && !tooLong && !mutation.isPending;

  return (
    <Modal
      open={open && !!entry}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      title="Request change"
      description={
        entry
          ? `${entry.subjectCode} · ${entry.sectionCode || 'No section'}`
          : undefined
      }
      size="sm"
      busy={mutation.isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50"
          >
            {mutation.isPending ? 'Sending…' : 'Send request'}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600 mb-3">
        <strong>"{entry?.subjectCode}"</strong> needs a change. Describe what
        needs to change; the Dean will review the request and return the entry
        to Draft if approved.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Faculty reassignment approved by the department"
        rows={4}
        maxLength={500}
        autoFocus
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none"
      />
      <p className="text-xs text-slate-400 mt-1 text-right">
        {tooShort ? 'At least 5 characters required' : `${reason.length}/500`}
      </p>
    </Modal>
  );
}
