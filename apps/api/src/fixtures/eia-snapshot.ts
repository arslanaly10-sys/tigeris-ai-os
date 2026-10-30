/**
 * EIA homepage snapshot supplied by the owner on 30 Oct 2026 (D-102). TIGERIS could not fetch eia.gov (the network
 * proxy refuses it), so the text was pasted in. It is recorded as a manual, unverified snapshot of a public source and
 * becomes one new signal for an analyst to triage. Nothing here is live, and it is not corroborated until the page is
 * captured by the connector or a person checks it against eia.gov.
 */
export const EIA_SNAPSHOT = {
  signalKey: 'SIG-EIA-20261029',
  externalId: 'eia:todayinenergy:2026-10-29:colombia-lng',
  title: "LNG imports make up increasing share of Colombia's natural gas supply",
  summary:
    "Colombia is importing more LNG as domestic production keeps falling. A possible drought this fall and winter could cut hydroelectric output and raise demand for gas-fired power. Colombia's government has declared a national disaster ahead of an expected strong El Niño. (EIA cites Gestor del Mercado de Gas Natural en Colombia (BEC) and Bolsa Mercantil de Colombia (BMC).)",
  postedOn: '2026-10-29T00:00:00Z',
  suppliedAt: '2026-10-30T00:00:00Z',
  url: 'https://www.eia.gov/',
  note: 'Text supplied by the owner from the EIA homepage on 30 Oct 2026; not fetched by TIGERIS. Verify against eia.gov before relying on it.',
} as const;
