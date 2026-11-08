import { useNavigate } from 'react-router-dom';
import Modal from '../../../../components/ui/Modal';
import BreakdownEmpty from '../BreakdownEmpty';
import ScheduleRow from '../ScheduleRow';
import type { RawSchedule } from '../../../../api/schedule.api';
import {
  DAY_ORDER,
  scheduleDay,
  scheduleStart,
  timeToMinutes,
} from '../../utils/dashboard.utils';

export default function SchedulesModal({
  open,
  onClose,
  schedules,
  deptName,
  term,
}: {
  open: boolean;
  onClose: () => void;
  schedules: RawSchedule[];
  deptName: string;
  term: any | undefined;
}) {
  const navigate = useNavigate();
  const total = schedules.length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Active Schedules"
      description={`${total} ${total === 1 ? 'entry' : 'entries'} in ${deptName}${
        term ? ` · ${term.termName}` : ''
      }`}
      size="lg"
    >
      {total === 0 ? (
        <BreakdownEmpty
          icon="event_note"
          message="No schedule entries yet. Start by plotting a subject."
          actionLabel="Open Timetable"
          onAction={() => {
            onClose();
            navigate('/timetable');
          }}
        />
      ) : (
        <div>
          {[...schedules]
            .sort((a, b) => {
              const da = DAY_ORDER[scheduleDay(a)] ?? 99;
              const db = DAY_ORDER[scheduleDay(b)] ?? 99;
              if (da !== db) return da - db;
              return (
                timeToMinutes(scheduleStart(a) || '00:00') -
                timeToMinutes(scheduleStart(b) || '00:00')
              );
            })
            .map((s) => (
              <ScheduleRow key={s.scheduleId} s={s} />
            ))}
        </div>
      )}
    </Modal>
  );
}