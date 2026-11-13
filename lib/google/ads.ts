import "server-only";
import { googleFetch, SCOPES, serviceAccount } from "./auth";

/**
 * Google Ads API over REST, as the dashboard's service account (added as a user of the agency MCC).
 * Env: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC, digits), GOOGLE_ADS_API_VERSION (default v25).
 */
const VERSION = () => process.env.GOOGLE_ADS_API_VERSION || "v25";
const digits = (v: string | undefined | null) => (v ?? "").replace(/\D/g, "");

export function adsConfigured() {
  return Boolean(serviceAccount() && process.env.GOOGLE_ADS_DEVELOPER_TOKEN && digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID));
}

export const mccId = () => digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

function headers() {
  return {
    "content-type": "application/json",
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "login-customer-id": mccId(),
  };
}

const url = (path: string) => `https://googleads.googleapis.com/${VERSION()}/${path}`;

type Row = Record<string, Record<string, unknown>>;

export async function gaql(customerId: string, query: string): Promise<Row[]> {
  const out: Row[] = [];
  let pageToken: string | undefined;
  do {
    const data = await googleFetch<{ results?: Row[]; nextPageToken?: string }>(
      url(`customers/${digits(customerId)}/googleAds:search`),
      [SCOPES.ads],
      { method: "POST", headers: headers(), body: JSON.stringify({ query, pageToken }) },
    );
    out.push(...(data.results ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

export interface AdsAccount {
  id: string;
  name: string;
  currency: string;
  status: string;
}

/** Client accounts linked to the MCC (what can be picked as a project source). */
export async function listAccounts(): Promise<AdsAccount[]> {
  const rows = await gaql(
    mccId(),
    `SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code,
            customer_client.status, customer_client.manager
     FROM customer_client
     WHERE customer_client.manager = false`,
  );
  return rows
    .map((r) => r.customerClient as { id?: string; descriptiveName?: string; currencyCode?: string; status?: string })
    .map((c) => ({ id: String(c.id ?? ""), name: c.descriptiveName ?? "", currency: c.currencyCode ?? "", status: c.status ?? "" }))
    .filter((a) => a.id)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export type GoogleCampaignStatus = "ENABLED" | "PAUSED" | "REMOVED";

export async function campaignStatuses(customerId: string): Promise<Map<string, GoogleCampaignStatus>> {
  const rows = await gaql(customerId, "SELECT campaign.id, campaign.status FROM campaign WHERE campaign.status != 'REMOVED'");
  return new Map(
    rows.map((r) => {
      const c = r.campaign as { id?: string; status?: GoogleCampaignStatus };
      return [String(c.id), c.status ?? "PAUSED"];
    }),
  );
}

export async function setCampaignStatus(customerId: string, campaignId: string, status: "ENABLED" | "PAUSED") {
  const cid = digits(customerId);
  await googleFetch(url(`customers/${cid}/campaigns:mutate`), [SCOPES.ads], {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      operations: [{ update: { resourceName: `customers/${cid}/campaigns/${digits(campaignId)}`, status }, updateMask: "status" }],
    }),
  });
}

/** Google geo target constants for the countries offered in the campaign builder. */
export const GEO_TARGETS: Record<string, number> = {
  UA: 2804,
  PL: 2616,
  DE: 2276,
  ES: 2724,
  IT: 2380,
  US: 2840,
  GB: 2826,
  KZ: 2398,
};

export interface SearchCampaignSpec {
  name: string;
  dailyBudget: number;
  geo: string[];
  keywords: string[];
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  /** true = start serving right away, false = create paused. */
  enable: boolean;
}

/**
 * Creates a Search campaign in one atomic mutate: budget, campaign (Maximize conversions),
 * geo targets, one ad group with phrase-match keywords and a responsive search ad.
 * validateOnly = Google checks everything without creating anything.
 */
export async function createSearchCampaign(customerId: string, spec: SearchCampaignSpec, validateOnly = false) {
  const cid = digits(customerId);
  const budget = `customers/${cid}/campaignBudgets/-1`;
  const campaign = `customers/${cid}/campaigns/-2`;
  const adGroup = `customers/${cid}/adGroups/-3`;

  const mutateOperations: object[] = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budget,
          name: `${spec.name} · budget · ${Date.now()}`,
          amountMicros: String(Math.round(spec.dailyBudget * 1_000_000)),
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaign,
          name: spec.name,
          status: spec.enable ? "ENABLED" : "PAUSED",
          advertisingChannelType: "SEARCH",
          campaignBudget: budget,
          maximizeConversions: {},
          networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false },
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        },
      },
    },
    ...spec.geo
      .filter((g) => GEO_TARGETS[g])
      .map((g) => ({
        campaignCriterionOperation: {
          create: { campaign, location: { geoTargetConstant: `geoTargetConstants/${GEO_TARGETS[g]}` } },
        },
      })),
    {
      adGroupOperation: {
        create: { resourceName: adGroup, campaign, name: `${spec.name} · группа 1`, status: "ENABLED", type: "SEARCH_STANDARD" },
      },
    },
    ...spec.keywords.map((text) => ({
      adGroupCriterionOperation: { create: { adGroup, status: "ENABLED", keyword: { text, matchType: "PHRASE" } } },
    })),
    {
      adGroupAdOperation: {
        create: {
          adGroup,
          status: "ENABLED",
          ad: {
            finalUrls: [spec.finalUrl],
            responsiveSearchAd: {
              headlines: spec.headlines.map((text) => ({ text })),
              descriptions: spec.descriptions.map((text) => ({ text })),
            },
          },
        },
      },
    },
  ];

  const data = await googleFetch<{ mutateOperationResponses?: { campaignResult?: { resourceName?: string } }[] }>(
    url(`customers/${cid}/googleAds:mutate`),
    [SCOPES.ads],
    { method: "POST", headers: headers(), body: JSON.stringify({ mutateOperations, validateOnly }) },
  );
  const created = data?.mutateOperationResponses?.find((r) => r.campaignResult)?.campaignResult?.resourceName ?? null;
  return { campaignResourceName: created, campaignId: created?.split("/").pop() ?? null };
}
