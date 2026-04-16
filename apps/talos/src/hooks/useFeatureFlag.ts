import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/usePortalSession';

interface FeatureFlagCheck {
 enabled: boolean;
 source: 'percentage' | 'user' | 'role' | 'environment' | 'default';
 loading: boolean;
 error: Error | null;
}

export function useFeatureFlag(flagName: string): FeatureFlagCheck {
 const { data: session } = useSession();
 const [state, setState] = useState<FeatureFlagCheck>({
 enabled: false,
 source: 'default',
 loading: true,
 error: null
 });

 useEffect(() => {
 // Feature flags API removed - return default values
 setState({
 enabled: false,
 source: 'default',
 loading: false,
 error: null
 });
 
 /* Disabled - API removed
 const checkFlag = async () => {
 try {
 setState(prev => ({ ...prev, loading: true, error: null }));

 const response = await fetch(buildTalosApiPath(`/api/feature-flags/${flagName}/check`), {
 method: 'GET',
 headers: {
 'Content-Type': 'application/json'
 }
 });

 if (!response.ok) {
 throw new Error(`Failed to check feature flag: ${response.statusText}`);
 }

 const data = await response.json();
 setState({
 enabled: data.enabled,
 source: data.source,
 loading: false,
 error: null
 });
 } catch (_error) {
 clientLogger.error('Error checking feature flag', { flagName, error });
 setState({
 enabled: false,
 source: 'default',
 loading: false,
 error: error as Error
 });
 }
 };

 checkFlag();
 */
 }, [flagName, session?.user?.id]);

 return state;
}

// Convenience hook that just returns the enabled state
export function useIsFeatureEnabled(flagName: string): boolean {
 const { enabled } = useFeatureFlag(flagName);
 return enabled;
}

// Feature flag names as constants (matching server-side)
export const FEATURE_FLAGS = {
 MODERN_INVENTORY_API: 'FEATURE_MODERN_INVENTORY_API',
 OPTIMIZED_DASHBOARD: 'FEATURE_OPTIMIZED_DASHBOARD',
 ENHANCED_SECURITY: 'FEATURE_ENHANCED_SECURITY',
 STANDARDIZED_SCHEMA: 'FEATURE_STANDARDIZED_SCHEMA',
 PERMISSION_SYSTEM: 'FEATURE_PERMISSION_SYSTEM'
} as const;
