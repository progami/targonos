type CaseThemeMode = 'light' | 'dark';

type CaseTone = {
  color: string;
  tint: string;
  line: string;
};

function lightTone(category: string): CaseTone {
  if (category === 'Action due') {
    return {
      color: '#9f1d12',
      tint: 'rgba(191, 36, 27, 0.12)',
      line: 'rgba(191, 36, 27, 0.35)',
    };
  }

  if (category === 'Forum watch') {
    return {
      color: '#8f5d00',
      tint: 'rgba(191, 125, 0, 0.12)',
      line: 'rgba(191, 125, 0, 0.3)',
    };
  }

  if (category === 'New case') {
    return {
      color: '#005f73',
      tint: 'rgba(0, 118, 133, 0.12)',
      line: 'rgba(0, 118, 133, 0.28)',
    };
  }

  return {
    color: '#0b5c58',
    tint: 'rgba(0, 194, 185, 0.12)',
    line: 'rgba(0, 194, 185, 0.26)',
  };
}

function darkTone(category: string): CaseTone {
  if (category === 'Action due') {
    return {
      color: '#ff8f80',
      tint: 'rgba(255, 143, 128, 0.14)',
      line: 'rgba(255, 143, 128, 0.34)',
    };
  }

  if (category === 'Forum watch') {
    return {
      color: '#f3cc74',
      tint: 'rgba(243, 204, 116, 0.14)',
      line: 'rgba(243, 204, 116, 0.28)',
    };
  }

  if (category === 'New case') {
    return {
      color: '#78dce8',
      tint: 'rgba(120, 220, 232, 0.14)',
      line: 'rgba(120, 220, 232, 0.28)',
    };
  }

  return {
    color: '#63ddd7',
    tint: 'rgba(99, 221, 215, 0.14)',
    line: 'rgba(99, 221, 215, 0.28)',
  };
}

export function getCaseTone(category: string, mode: CaseThemeMode): CaseTone {
  return mode === 'dark' ? darkTone(category) : lightTone(category);
}

export function getCaseAccentTextColor(mode: CaseThemeMode): string {
  return mode === 'dark' ? '#7ce7e0' : '#0b5c58';
}

export function getCaseDividerColor(mode: CaseThemeMode): string {
  return mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 44, 81, 0.08)';
}

export function getCaseDividerStrongColor(mode: CaseThemeMode): string {
  return mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 44, 81, 0.12)';
}

export function getCaseActiveDateBorderColor(mode: CaseThemeMode): string {
  return mode === 'dark' ? 'rgba(127, 232, 225, 0.28)' : 'rgba(0, 44, 81, 0.26)';
}

export function getCaseActiveDateBackgroundColor(mode: CaseThemeMode): string {
  return mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 44, 81, 0.06)';
}
