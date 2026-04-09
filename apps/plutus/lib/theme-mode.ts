export function resolveMuiThemeMode(
  mounted: boolean,
  resolvedTheme: string | undefined,
): 'light' | 'dark' {
  if (!mounted) return 'light';
  return resolvedTheme === 'dark' ? 'dark' : 'light';
}
