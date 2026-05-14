/**
 * Cloud-only slot rendered at the top of Settings → Profile.
 *
 * In open-source builds: returns null.
 *
 * In Cloud: shows the "Upgrade to Workspace" banner for users who haven't run
 * the account-level workspace upgrade yet (LOBE-8925).
 */
export default function BusinessProfileBanner() {
  return null;
}
