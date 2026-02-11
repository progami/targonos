export type AttentionResponse = {
  blockedJobs: Array<{
    id: string;
    status: 'BLOCKED';
    scheduledAt: string;
    lastError: string | null;
    target: { id: string; label: string; marketplace: 'US' | 'UK'; owner: 'OURS' | 'COMPETITOR' };
  }>;
  failedJobs: Array<{
    id: string;
    status: 'FAILED';
    scheduledAt: string;
    finishedAt: string | null;
    lastError: string | null;
    target: { id: string; label: string; marketplace: 'US' | 'UK'; owner: 'OURS' | 'COMPETITOR' };
  }>;
  alerts: Array<{
    id: string;
    sentAt: string;
    subject: string;
    target: { id: string; label: string; marketplace: 'US' | 'UK'; owner: 'OURS' | 'COMPETITOR' };
  }>;
  signalChanges: Array<{
    id: string;
    startedAt: string;
    changeSummary: unknown;
    target: { id: string; label: string; marketplace: 'US' | 'UK'; owner: 'OURS' | 'COMPETITOR' };
  }>;
  assetsNoActiveSet: Array<{
    updatedAt: string;
    target: { id: string; label: string; marketplace: 'US' | 'UK'; owner: 'OURS' };
  }>;
  assetsComplianceErrors: Array<{
    updatedAt: string;
    target: { id: string; label: string; marketplace: 'US' | 'UK'; owner: 'OURS' };
    setErrors: string[];
    slotErrorsCount: number;
  }>;
};
