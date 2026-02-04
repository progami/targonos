export const PROTECTED_STRATEGY_IDS = [
  'demo-strategy',
  'default-strategy',
  'cmjiwt2c50000xv40iug75zzw',
  'cmjrp4vjf0000xv08neh5loe3',
] as const;

export const DEMO_STRATEGY_ID: (typeof PROTECTED_STRATEGY_IDS)[number] = 'demo-strategy';

export function isProtectedStrategyId(id: string): boolean {
  return (PROTECTED_STRATEGY_IDS as readonly string[]).includes(id);
}
