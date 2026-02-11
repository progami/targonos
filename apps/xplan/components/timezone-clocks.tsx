'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';

function formatTimestamp(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  })
    .format(value)
    .replace(',', '');
}

function formatTimeZoneLabel(timeZone: string) {
  const parts = timeZone.split('/');
  const raw = parts[parts.length - 1] ?? timeZone;
  return raw.replace(/_/g, ' ');
}

export function TimeZoneClocks({ reportTimeZone }: { reportTimeZone: string }) {
  const [now, setNow] = useState(() => new Date());

  const userTimeZone = useMemo(() => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const reportNow = formatTimestamp(now, reportTimeZone);
  const userNow = formatTimestamp(now, userTimeZone);
  const reportLabel = formatTimeZoneLabel(reportTimeZone);
  const userLabel = formatTimeZoneLabel(userTimeZone);

  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <div><span className="font-semibold">Report:</span> {reportLabel} {reportNow}</div>
          <div><span className="font-semibold">Local:</span> {userLabel} {userNow}</div>
        </div>
      }
      position="bottom"
      className="hidden sm:flex"
    >
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm backdrop-blur dark:border-[#0b3a52] dark:bg-[#06182b]/70 dark:text-slate-300">
        <span className="tabular-nums">{reportNow.split(' ').pop()}</span>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <span className="tabular-nums">{userNow.split(' ').pop()}</span>
      </div>
    </Tooltip>
  );
}
