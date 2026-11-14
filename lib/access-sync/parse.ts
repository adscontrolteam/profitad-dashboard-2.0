/** Ids from the links people paste into «Сервисы проекта» (pure). */

/** GA4: «…/analytics/web/#/p123456789/…», «properties/123456789» or the bare number. */
export function ga4PropertyId(v: string | undefined) {
  const s = (v ?? "").trim();
  return s.match(/[#/]p(\d{6,})/)?.[1] ?? s.match(/properties\/(\d{6,})/)?.[1] ?? (/^\d{6,}$/.test(s) ? s : null);
}

/** GTM: «tagmanager.google.com/#/container/accounts/123/containers/456/…». The public «GTM-XXXX» id is not enough. */
export function gtmIds(v: string | undefined) {
  const m = (v ?? "").match(/accounts\/(\d+)\/containers\/(\d+)/);
  return m ? { accountId: m[1], containerId: m[2] } : null;
}
