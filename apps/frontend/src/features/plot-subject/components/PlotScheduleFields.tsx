import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import TimeSlotSelect from '../../../components/ui/TimeSlotSelect';
import { SectionHeader, HelperText } from './PlotFormBits';
import { DAYS, DAY_ABBR, type MultiDayRow, type PlotFormState } from '../types';

interface SessionStatus {
  current: number;
  limit: number | null;
  exceeded: boolean;
  message: string | null;
  remaining: number;
}

export interface PlotScheduleFieldsProps {
  mode: 'single' | 'multi';
  form: PlotFormState;
  setForm: Dispatch<SetStateAction<PlotFormState>>;
  multiDays: MultiDayRow[];
  startOptions: string[];
  endOptions: string[];
  timeOptions: string[];
  onFieldChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  sessionStatus: SessionStatus;
  multiCount: number;
  toggleDay: (day: string) => void;
  updateDayTime: (
    day: string,
    field: 'startTime' | 'endTime',
    value: string,
  ) => void;
  applyDefaultTimes: (start: string, end: string) => void;
  applyPresetDays: (days: (typeof DAYS)[number][]) => void;
}

export default function PlotScheduleFields({
  mode,
  form,
  setForm,
  multiDays,
  startOptions,
  endOptions,
  timeOptions,
  onFieldChange,
  sessionStatus,
  multiCount,
  toggleDay,
  updateDayTime,
  applyDefaultTimes,
  applyPresetDays,
}: PlotScheduleFieldsProps) {
  return (
    <section>
            <SectionHeader
              step={2}
              icon="schedule"
              title="Schedule"
              subtitle={
                mode === 'single'
                  ? 'When does this class meet?'
                  : 'Tick each day this class meets.'
              }
            />

            {mode === 'single' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Day *
                  </label>
                  <select
                    name="dayOfWeek"
                    required
                    value={form.dayOfWeek}
                    onChange={onFieldChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Start *
                  </label>
                  <TimeSlotSelect
                    value={form.startTime}
                    onChange={(v) =>
                      setForm((prev) => ({ ...prev, startTime: v }))
                    }
                    options={startOptions}
                    ariaLabel="Start time"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    End *
                  </label>
                  <TimeSlotSelect
                    value={form.endTime}
                    onChange={(v) =>
                      setForm((prev) => ({ ...prev, endTime: v }))
                    }
                    options={endOptions}
                    ariaLabel="End time"
                  />
                </div>
              </div>
            )}

            {mode === 'multi' && (
              <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-on-surface-variant">
                    {multiCount} day{multiCount === 1 ? '' : 's'} selected
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        applyPresetDays(['Monday', 'Wednesday', 'Friday'])
                      }
                      className="px-2 py-1 text-[10px] font-semibold border border-surface-variant rounded-md hover:bg-surface-container-high"
                    >
                      MWF
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        applyPresetDays(['Tuesday', 'Thursday'])
                      }
                      className="px-2 py-1 text-[10px] font-semibold border border-surface-variant rounded-md hover:bg-surface-container-high"
                    >
                      TTh
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        applyPresetDays([
                          'Monday',
                          'Tuesday',
                          'Wednesday',
                          'Thursday',
                          'Friday',
                        ])
                      }
                      className="px-2 py-1 text-[10px] font-semibold border border-surface-variant rounded-md hover:bg-surface-container-high"
                    >
                      M–F
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetDays([])}
                      className="px-2 py-1 text-[10px] font-semibold border border-surface-variant rounded-md hover:bg-surface-container-high"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-surface-container-low">
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-[10px] font-semibold text-on-surface-variant mb-1 uppercase tracking-wider">
                      Default start
                    </label>
                    <TimeSlotSelect
                      value={multiDays[0].startTime}
                      onChange={(v) =>
                        applyDefaultTimes(v, multiDays[0].endTime)
                      }
                      options={startOptions}
                      ariaLabel="Default start time"
                    />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-[10px] font-semibold text-on-surface-variant mb-1 uppercase tracking-wider">
                      Default end
                    </label>
                    <TimeSlotSelect
                      value={multiDays[0].endTime}
                      onChange={(v) =>
                        applyDefaultTimes(multiDays[0].startTime, v)
                      }
                      options={endOptions}
                      ariaLabel="Default end time"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      applyDefaultTimes(
                        multiDays[0].startTime,
                        multiDays[0].endTime,
                      )
                    }
                    className="px-3 py-2 text-xs font-semibold border border-surface-variant rounded-md hover:bg-surface-container-high transition"
                  >
                    Apply to all
                  </button>
                </div>

                <ul className="divide-y divide-surface-variant">
                  {multiDays.map((row) => (
                    <li
                      key={row.day}
                      className="py-2.5 flex flex-wrap items-center gap-3"
                    >
                      <label className="flex items-center gap-2 min-w-[110px] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          onChange={() => toggleDay(row.day)}
                          className="accent-[#5c1219] w-4 h-4"
                        />
                        <span className="text-sm font-semibold text-on-surface">
                          {DAY_ABBR[row.day] ?? row.day}
                        </span>
                      </label>
                      {row.enabled && (
                        <>
                          <div className="flex-1 min-w-[110px]">
                            <TimeSlotSelect
                              value={row.startTime}
                              onChange={(v) =>
                                updateDayTime(row.day, 'startTime', v)
                              }
                              options={startOptions}
                              ariaLabel={`${row.day} start time`}
                            />
                          </div>
                          <span className="text-xs text-on-surface-variant">
                            to
                          </span>
                          <div className="flex-1 min-w-[110px]">
                            <TimeSlotSelect
                              value={row.endTime}
                              onChange={(v) =>
                                updateDayTime(row.day, 'endTime', v)
                              }
                              options={timeOptions.slice(
                                timeOptions.indexOf(row.startTime) + 1,
                              )}
                              ariaLabel={`${row.day} end time`}
                            />
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>

                {sessionStatus.limit != null && (
                  <HelperText
                    tone={
                      multiCount > sessionStatus.remaining ? 'warn' : 'muted'
                    }
                  >
                    The prospectus allows {sessionStatus.limit} {form.loadType}{' '}
                    session{sessionStatus.limit === 1 ? '' : 's'}. You have{' '}
                    {sessionStatus.remaining} left — pick at most{' '}
                    {sessionStatus.remaining} day
                    {sessionStatus.remaining === 1 ? '' : 's'}.
                  </HelperText>
                )}
              </div>
            )}
          </section>
  );
}
