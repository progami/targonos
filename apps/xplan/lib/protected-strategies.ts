export const DEMO_STRATEGY_ID = 'demo-strategy' as const;

export const PROTECTED_STRATEGY_IDS = [] as const;

export function isProtectedStrategyId(id: string): boolean {
  return (PROTECTED_STRATEGY_IDS as readonly string[]).includes(id);
}
