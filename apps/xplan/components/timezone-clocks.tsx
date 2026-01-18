'use client';

import { useEffect, useMemo, useState } from 'react';

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
    <div className="hidden items-center gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur dark:border-[#0b3a52] dark:bg-[#06182b]/70 dark:text-slate-300 sm:flex" title={`${reportTimeZone} / ${userTimeZone}`}>
      <div className="flex flex-col leading-tight">
        <span className="uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Report
        </span>
        <span className="tabular-nums text-slate-800 dark:text-slate-100">
          {reportLabel} {reportNow}
        </span>
      </div>
      <span className="text-slate-300 dark:text-slate-600">|</span>
      <div className="flex flex-col leading-tight">
        <span className="uppercase tracking-wide text-slate-500 dark:text-slate-400">
          User
        </span>
        <span className="tabular-nums text-slate-800 dark:text-slate-100">
          {userLabel} {userNow}
        </span>
      </div>
    </div>
  );
}
