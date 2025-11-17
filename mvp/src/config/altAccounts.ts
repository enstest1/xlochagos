/**
 * List of all alt accounts for filtering and coordination
 */
export const ALT_ACCOUNTS = [
  '@FIZZonAbstract',
  '@Rick_Rupen',
  '@Dope_MusicVideo',
  '@aplep333'
] as const;

export const PELPA_HANDLE = '@pelpa333';

/**
 * Check if a handle is one of our alt accounts
 */
export function isOurAlt(handle: string): boolean {
  return ALT_ACCOUNTS.includes(handle as any);
}

/**
 * Check if a handle is Pelpa or any of our alts
 */
export function isOurAccount(handle: string): boolean {
  return handle === PELPA_HANDLE || isOurAlt(handle);
}

