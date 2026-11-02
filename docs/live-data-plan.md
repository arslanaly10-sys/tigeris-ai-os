# Live data phase (D-127)

Owner direction, 2 November 2026: live data first, for all three decision types (chokepoint concentration, oil-price
shock on the portfolio, critical-infrastructure resilience), deployed on Azure, using free public feeds now,
licensed feeds when the owner supplies keys, client file imports, and the synthetic demo kept alongside.

## The rule for the word "live"

A value is shown as **Live** only when all three hold:

1. it came from a connector whose last fetch succeeded (status `connected`), not from registration or a fixture;
2. it was fetched within the source's freshness window (twice its schedule interval, and never more than 48 hours);
3. it carries its source, series identifier, observation date and fetch time.

Otherwise it is shown as **Snapshot, as of <fetch time>**, or **Stale** past its window. The observation date and the
fetch time are always both visible: a daily price fetched today can still describe yesterday. Nothing synthetic, sample
or illustrative can ever be labelled Live.

## Sources

| Source                     | Host                           | Key      | Feeds                                                  |
| -------------------------- | ------------------------------ | -------- | ------------------------------------------------------ |
| FRED (St. Louis Fed)       | `fred.stlouisfed.org`          | none     | Brent and WTI daily spot prices                        |
| IMF PortWatch              | `services9.arcgis.com`         | none     | Daily transit calls and capacity through chokepoints   |
| EIA Open Data v2           | `api.eia.gov`                  | free key | Petroleum and natural-gas prices, stocks, production   |
| ECB Data Portal            | `data-api.ecb.europa.eu`       | none     | Daily reference exchange rates                         |
| World Bank Indicators      | `api.worldbank.org`            | none     | Annual country indicators (energy, power, GDP)         |
| Vessel tracking (licensed) | provider of the owner's choice | licence  | AIS positions near chokepoints (adapter, owner's keys) |
| Market data (licensed)     | provider of the owner's choice | licence  | Prices and curves (adapter, owner's keys)              |
| Client files               | upload (already built)         | n/a      | Holdings, mandates, limits, asset registers            |

Every host must be allowed by the environment's network policy, and in production by the institution's egress policy.

## Slices

- **L1 Observation store and public feeds.** A versioned `observations` table (series, observation date, value, unit,
  source, fetch run), row-level security like every other table. Parsers for FRED, PortWatch, EIA, ECB and World Bank,
  each unit-tested on the provider's documented format. The freshness rule above, computed in shared code. Data &
  Integrations shows each series, its last fetch and its label.
- **L2 Use cases on real values.**
  - Oil-price shock: the template starts from the latest Brent observation, with its source and dates.
  - Chokepoint concentration: Hormuz transits against their own trailing baseline, with a watch rule that raises an
    intervention on a sustained drop.
  - Critical-infrastructure resilience: fuel and power indicators feed the utilities models.
  - Movement shown on maps stays "Illustrative simulation" unless it comes from licensed vessel data.
- **L3 Licensed adapters.** Vessel-tracking and market-data adapters behind the same store, switched on only with the
  owner's licence and keys.
- **L4 Azure.**
  - Infrastructure as code: AKS with the existing Helm chart, Azure Database for PostgreSQL Flexible Server, Key Vault
    for secrets, and an Azure Blob evidence adapter.
  - Region: UAE North, subject to the institution's residency policy. Sign-in is Entra, already built.

Each slice ships with tests, a decision entry and a passing CI run.
