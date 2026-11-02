/**
 * Public live-data feeds (D-127). Each is a read-only REST connector with an observation format, a public source the
 * owner approved by directing the live-data phase, and a daily schedule. Every connector starts `configured`: nothing
 * is shown as Live until a fetch has actually succeeded. The PortWatch field names and series follow the provider's
 * published service and are confirmed on the first fetch; the parser refuses the response if any field is absent.
 */
import { eq } from 'drizzle-orm';
import { withInstitution, type Db } from './client';
import { connectors, principalRoles, sources } from './schema';

interface Feed {
  key: string;
  sourceKey: string;
  publisher: string;
  title: string;
  terms: string;
  endpoint: string;
  format: 'fred_csv' | 'ecb_csv' | 'worldbank_json' | 'eia_v2' | 'arcgis_features';
  options: Record<string, unknown>;
  sectorKey: 'energy' | 'utilities' | 'capital' | 'supply_chain';
  schedule: string;
  authRef?: string;
}

export const LIVE_FEEDS: Feed[] = [
  {
    key: 'CON-FRED-OIL',
    sourceKey: 'fred-oil-spot',
    publisher: 'Federal Reserve Bank of St. Louis (FRED), from EIA',
    title: 'Brent and WTI crude oil spot prices, daily',
    terms: 'FRED public data; cite FRED and the original source (EIA)',
    endpoint: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU,DCOILWTICO',
    format: 'fred_csv',
    options: { unit: 'USD per barrel' },
    sectorKey: 'energy',
    schedule: '17 7 * * *',
  },
  {
    key: 'CON-PORTWATCH-HORMUZ',
    sourceKey: 'imf-portwatch-chokepoints',
    publisher: 'IMF PortWatch',
    title: 'Daily transit calls through maritime chokepoints',
    terms: 'IMF PortWatch public data; cite IMF PortWatch (AIS-derived estimates)',
    endpoint:
      'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query?where=portname%3D%27Strait%20of%20Hormuz%27&outFields=date,portname,n_total,n_tanker,capacity&orderByFields=date%20DESC&resultRecordCount=120&f=json',
    format: 'arcgis_features',
    options: {
      arcgis: {
        dateField: 'date',
        seriesField: 'portname',
        valueFields: ['n_total', 'n_tanker', 'capacity'],
        seriesPrefix: 'PortWatch',
      },
    },
    sectorKey: 'supply_chain',
    schedule: '23 7 * * *',
  },
  {
    key: 'CON-EIA-SPOT',
    sourceKey: 'eia-open-data',
    publisher: 'U.S. Energy Information Administration',
    title: 'EIA Open Data: Brent spot price, daily',
    terms: 'EIA public information; free API key; citation required',
    endpoint:
      'https://api.eia.gov/v2/petroleum/pri/spt/data/?frequency=daily&data[0]=value&facets[series][]=RBRTE&sort[0][column]=period&sort[0][direction]=desc&length=60',
    format: 'eia_v2',
    options: {},
    sectorKey: 'energy',
    schedule: '29 7 * * *',
    authRef: 'EIA_API_KEY',
  },
  {
    key: 'CON-ECB-FX',
    sourceKey: 'ecb-reference-rates',
    publisher: 'European Central Bank',
    title: 'Euro reference rate against the US dollar, daily',
    terms: 'ECB statistics; reuse permitted with attribution',
    endpoint:
      'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=60&format=csvdata',
    format: 'ecb_csv',
    options: {},
    sectorKey: 'capital',
    schedule: '41 16 * * *',
  },
  {
    key: 'CON-WB-ENERGY',
    sourceKey: 'worldbank-energy-use',
    publisher: 'World Bank',
    title: 'Energy use per capita, GCC economies, annual',
    terms: 'World Bank open data, CC BY 4.0',
    endpoint:
      'https://api.worldbank.org/v2/country/ARE;SAU;QAT;KWT;OMN;BHR/indicator/EG.USE.PCAP.KG.OE?format=json&per_page=200&mrv=10',
    format: 'worldbank_json',
    options: {},
    sectorKey: 'utilities',
    schedule: '53 5 * * 1',
  },
];

export async function seedLiveFeeds(db: Db, institutionId: string) {
  await withInstitution(db, institutionId, async (tx) => {
    const [admin] = await tx
      .select({ id: principalRoles.principalId })
      .from(principalRoles)
      .where(eq(principalRoles.role, 'administrator'));
    for (const f of LIVE_FEEDS) {
      const [src] = await tx
        .insert(sources)
        .values({
          institutionId,
          key: f.sourceKey,
          publisher: f.publisher,
          title: f.title,
          sourceClass: 'public',
          url: f.endpoint,
          termsRef: f.terms,
          allowedPurpose: 'Institutional analysis (registered live-data connector, D-127)',
          cadence: 'Daily or as published',
          // Freshness is judged per fetch by the connector rule (D-127), not by a source-level limit.
          freshnessLimitHours: null,
          // Approved by the owner's direction for the live-data phase (D-127). Connectors stay "configured" until a
          // fetch actually succeeds.
          approvalStatus: 'approved',
        })
        .returning({ id: sources.id });
      await tx.insert(connectors).values({
        institutionId,
        key: f.key,
        provider: f.publisher,
        name: f.title,
        connectionType: 'rest',
        authType: f.authRef ? 'api_key' : 'none',
        authRef: f.authRef ?? null,
        endpoint: f.endpoint,
        datasets: ['observations'],
        sectorKey: f.sectorKey,
        classification: 'internal',
        schedule: f.schedule,
        status: 'configured',
        mappingVersion: `observations-${f.format}-v1`,
        observationFormat: f.format,
        observationOptions: f.options,
        sourceId: src!.id,
        createdBy: admin!.id,
      });
    }
  });
}
