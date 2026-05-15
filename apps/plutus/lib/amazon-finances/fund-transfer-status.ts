export function isPostableFundTransferStatus(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  return value.trim().toLowerCase() !== 'processing';
}
