export const PROTECTED_STRATEGY_IDS = [
  'default-strategy',
  'cmjiwt2c50000xv40iug75zzw',
  'cmjrp4vjf0000xv08neh5loe3',
] as const;

export function isProtectedStrategyId(id: string): boolean {
  return (PROTECTED_STRATEGY_IDS as readonly string[]).includes(id);
}

