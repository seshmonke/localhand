/**
 * Full-page navigation to a provider-hosted URL. Kept in one place so the
 * components stay testable: tests mock this module instead of trying to spy on
 * a non-configurable `window.location`.
 */
export function goToExternal(url: string): void {
  window.location.assign(url);
}
