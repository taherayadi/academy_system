import React from 'react';
import { X, Clock } from 'lucide-react';
import { StudentTimeSheet, TIMESHEET_DAYS, getTimeSlotsForDay } from '../types';

interface TimeSheetViewDialogProps {
  key?: React.Key;
  timeSheet: StudentTimeSheet;
  studentName?: string;
  onClose: () => void;
}

function getAllUniqueSlots(schedule: StudentTimeSheet['weeklySchedule']): string[] {
  const slots = new Set<string>();
  schedule.forEach(s => {
    slots.add(`${s.startTime} — ${s.endTime}`);
  });
  return Array.from(slots).sort((a, b) => {
    const aTime = a.split(' — ')[0];
    const bTime = b.split(' — ')[0];
    return aTime.localeCompare(bTime);
  });
}

export default function TimeSheetViewDialog({ timeSheet, studentName, onClose }: TimeSheetViewDialogProps) {
  const uniqueSlots = getAllUniqueSlots(timeSheet.weeklySchedule);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden my-4">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#257C86]/20 rounded-xl">
              <Clock className="h-5 w-5 text-[#3A93A0]" />
            </div>
            <div>
              <h3 className="text-sm font-black">{timeSheet.establishmentName} — {timeSheet.schoolYear}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {timeSheet.gradeLevel}
                {timeSheet.branch ? ` / ${timeSheet.branch}` : ''}
                {timeSheet.className ? ` / ${timeSheet.className}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {studentName && (
              <span className="px-3 py-1 bg-[#257C86]/20 text-[#3A93A0] rounded-lg text-[11px] font-bold">
                {studentName}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="p-5 overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            {/* Day headers */}
            <thead>
              <tr>
                <th className="p-2 bg-slate-50 border border-slate-200 rounded-tl-xl text-right">
                  <span className="text-[10px] font-black text-slate-500">الحصة / اليوم</span>
                </th>
                {TIMESHEET_DAYS.map(day => (
                  <th
                    key={day}
                    className="p-3 bg-[#257C86] text-white text-xs font-black text-center"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uniqueSlots.length === 0 ? (
                <tr>
                  <td colSpan={TIMESHEET_DAYS.length + 1} className="p-8 text-center text-slate-400 font-bold text-sm border border-slate-200">
                    لا توجد حصص مسجلة
                  </td>
                </tr>
              ) : (
                uniqueSlots.map((slotLabel, rowIdx) => {
                  const [start, end] = slotLabel.split(' — ');
                  return (
                    <tr key={slotLabel} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      {/* Time slot label */}
                      <td className="p-3 border border-slate-200 text-right">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-[#257C86] shrink-0" />
                          <div>
                            <p className="text-[11px] font-black text-[#14464E]">{slotLabel}</p>
                          </div>
                        </div>
                      </td>
                      {/* Day cells */}
                      {TIMESHEET_DAYS.map(day => {
                        const daySlots = getTimeSlotsForDay(timeSheet.weeklySchedule, day);
                        const match = daySlots.find(s => s.startTime === start && s.endTime === end);
                        return (
                          <td key={day} className="p-2 border border-slate-200 text-center">
                            {match ? (
                              <div className="mx-auto w-full h-full min-h-[36px] flex items-center justify-center bg-[#257C86]/10 border border-[#257C86]/30 rounded-lg">
                                <span className="text-[#257C86] text-lg">✓</span>
                              </div>
                            ) : (
                              <div className="mx-auto w-full h-full min-h-[36px] flex items-center justify-center">
                                <span className="text-slate-300 text-lg">—</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Legend */}
          <div className="mt-4 flex items-center gap-4 text-[10px] font-bold text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-[#257C86]/10 border border-[#257C86]/30 rounded flex items-center justify-center">
                <span className="text-[#257C86] text-[8px]">✓</span>
              </div>
              <span>حصة مجدولة</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-300">—</span>
              <span>لا توجد حصة</span>
            </div>
            <span className="mr-auto text-slate-400">{timeSheet.weeklySchedule.length} حصة أسبوعياً</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
