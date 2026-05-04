export const panelBg = 'rgba(0, 20, 35, 0.85)';
export const panelBgDarker = 'rgba(0, 20, 35, 0.95)';
export const panelBgLighter = 'rgba(0, 20, 35, 0.6)';
export const panelBorder = '1px solid rgba(255,255,255,0.07)';
export const panelRadius = '12px';
export const subtleBorder = '1px solid rgba(255,255,255,0.06)';
export const subtleBg = 'rgba(255,255,255,0.025)';

export const textPrimary = 'rgba(255,255,255,0.95)';
export const textSecondary = 'rgba(255,255,255,0.7)';
export const textMuted = 'rgba(255,255,255,0.6)';
export const textDim = 'rgba(255,255,255,0.45)';

export const teal = '#00C2B9';
export const tealFaded = 'rgba(0, 194, 185, 0.5)';
export const tealSubtle = 'rgba(0, 194, 185, 0.12)';

export const dangerText = '#ef4444';
export const warningText = '#eab308';
export const successText = '#34d399';

export const panelSx = {
  bgcolor: panelBg,
  border: panelBorder,
  borderRadius: panelRadius,
  overflow: 'hidden' as const,
};

export const panelHeadSx = {
  display: 'flex' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'center' as const,
  px: 2,
  py: 1.25,
  borderBottom: subtleBorder,
  bgcolor: subtleBg,
};

export const panelTitleSx = {
  fontSize: '0.625rem',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: textMuted,
  fontWeight: 600,
};

export const panelBadgeSx = {
  fontSize: '0.625rem',
  color: textMuted,
};

export const chartControlRailSx = {
  display: 'flex' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'center' as const,
  gap: 2,
  flexWrap: 'wrap' as const,
  px: 1.25,
  py: 1,
  border: subtleBorder,
  borderRadius: '10px',
  bgcolor: 'rgba(255,255,255,0.03)',
  minHeight: 56,
};

export function chartToggleButtonSx(active: boolean, accent: string) {
  return {
    minWidth: 0,
    px: 1.4,
    textTransform: 'none' as const,
    fontWeight: 700,
    letterSpacing: '0.01em',
    borderWidth: 1,
    borderColor: active ? `${accent}88` : 'rgba(255,255,255,0.18)',
    bgcolor: active ? `${accent}24` : 'rgba(255,255,255,0.045)',
    color: 'rgba(255,255,255,0.9)',
    '&:hover': {
      borderColor: active ? `${accent}aa` : 'rgba(255,255,255,0.28)',
      bgcolor: active ? `${accent}34` : 'rgba(255,255,255,0.07)',
    },
  };
}
