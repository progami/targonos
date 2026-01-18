import { coerceNumber } from '@/lib/utils/numbers';
import { LeadStageOverrideInput, LeadStageTemplateInput, LeadTimeProfile } from './types';

export type LeadStageKey = keyof LeadTimeProfile;

const STAGE_LABELS: Record<string, LeadStageKey> = {
  'production time': 'productionWeeks',
  production: 'productionWeeks',
  'source prep': 'sourceWeeks',
  'ocean transit': 'oceanWeeks',
  ocean: 'oceanWeeks',
  'final mile': 'finalWeeks',
};

const DEFAULT_LEAD_TIME: LeadTimeProfile = {
  productionWeeks: 0,
  sourceWeeks: 0,
  oceanWeeks: 0,
  finalWeeks: 0,
};

function identifyStage(label: string | null | undefined): LeadStageKey | null {
  if (!label) return null;
  const key = STAGE_LABELS[label.trim().toLowerCase()];
  return key ?? null;
}

export function buildLeadTimeProfiles(
  templates: LeadStageTemplateInput[],
  overrides: LeadStageOverrideInput[],
  productIds: string[],
): Map<string, LeadTimeProfile> {
  const templateDefaults: Partial<LeadTimeProfile> = {};
  const templateStageMap = new Map<string, LeadStageKey>();

  for (const template of templates) {
    const stage = identifyStage(template.label);
    if (!stage) continue;
    templateDefaults[stage] = Math.max(0, coerceNumber(template.defaultWeeks));
    templateStageMap.set(template.id, stage);
  }

  const profiles = new Map<string, LeadTimeProfile>();

  for (const productId of productIds) {
    profiles.set(productId, { ...DEFAULT_LEAD_TIME, ...templateDefaults });
  }

  for (const override of overrides) {
    const stage = templateStageMap.get(override.stageTemplateId);
    if (!stage) continue;
    const profile = profiles.get(override.productId);
    if (!profile) continue;
    profile[stage] = Math.max(0, coerceNumber(override.durationWeeks));
  }

  return profiles;
}

export function getLeadTimeProfile(
  productId: string,
  profiles: Map<string, LeadTimeProfile>,
): LeadTimeProfile {
  return profiles.get(productId) ?? { ...DEFAULT_LEAD_TIME };
}
