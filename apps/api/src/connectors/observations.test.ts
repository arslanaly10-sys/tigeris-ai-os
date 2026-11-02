// Observation parsers (D-127). Bodies below are short samples written in each provider's documented response format to
// test parsing; they are not real data and nothing here is presented as observed.
import { describe, expect, it } from 'vitest';
import { parseObservations, ParseError } from './observations';

describe('observation parsers', () => {
  it('FRED CSV: reads dates and values, skips "." as missing, keeps the series id', () => {
    const body = 'observation_date,DCOILBRENTEU\n2026-10-29,70.5\n2026-10-30,.\n2026-10-31,71.25\n';
    expect(parseObservations('fred_csv', body, { unit: 'USD per barrel' })).toEqual([
      { seriesKey: 'DCOILBRENTEU', observedOn: '2026-10-29', value: 70.5, unit: 'USD per barrel' },
      { seriesKey: 'DCOILBRENTEU', observedOn: '2026-10-31', value: 71.25, unit: 'USD per barrel' },
    ]);
    expect(parseObservations('fred_csv', 'DATE,DCOILWTICO\n2026-10-31,67\n')[0]!.seriesKey).toBe(
      'DCOILWTICO',
    );
  });

  it('ECB SDMX CSV: finds columns by name, whatever their order', () => {
    const body = 'KEY,FREQ,TIME_PERIOD,OBS_VALUE,UNIT\nEXR.D.USD.EUR.SP00.A,D,2026-10-31,1.0812,USD\n';
    expect(parseObservations('ecb_csv', body)).toEqual([
      { seriesKey: 'ECB:EXR.D.USD.EUR.SP00.A', observedOn: '2026-10-31', value: 1.0812, unit: 'USD' },
    ]);
  });

  it('World Bank: skips null years and dates annual values to 1 January', () => {
    const body = JSON.stringify([
      { page: 1 },
      [
        {
          indicator: { id: 'EG.USE.PCAP.KG.OE' },
          countryiso3code: 'ARE',
          date: '2025',
          value: null,
          unit: '',
        },
        {
          indicator: { id: 'EG.USE.PCAP.KG.OE' },
          countryiso3code: 'ARE',
          date: '2024',
          value: 7000.5,
          unit: '',
        },
      ],
    ]);
    expect(parseObservations('worldbank_json', body)).toEqual([
      { seriesKey: 'WB:ARE:EG.USE.PCAP.KG.OE', observedOn: '2024-01-01', value: 7000.5, unit: null },
    ]);
  });

  it('World Bank: reports the API message instead of guessing', () => {
    const body = JSON.stringify([{ message: [{ id: '120', value: 'Invalid value' }] }]);
    expect(() => parseObservations('worldbank_json', body)).toThrow('World Bank: Invalid value');
  });

  it('EIA v2: reads period, series and units; values may arrive as strings', () => {
    const body = JSON.stringify({
      response: { data: [{ period: '2026-10-31', series: 'RBRTE', value: '71.25', units: '$/BBL' }] },
    });
    expect(parseObservations('eia_v2', body)).toEqual([
      { seriesKey: 'EIA:RBRTE', observedOn: '2026-10-31', value: 71.25, unit: '$/BBL' },
    ]);
    expect(() => parseObservations('eia_v2', JSON.stringify({ error: 'API_KEY_INVALID' }))).toThrow(
      'EIA: API_KEY_INVALID',
    );
  });

  it('ArcGIS: uses only the fields the connector names, and refuses when they are absent', () => {
    const fields = {
      dateField: 'date',
      valueFields: ['n_total'],
      seriesField: 'portid',
      seriesPrefix: 'PortWatch',
    };
    const body = JSON.stringify({
      features: [{ attributes: { date: Date.UTC(2026, 9, 31), portid: 'chokepoint6', n_total: 98 } }],
    });
    expect(parseObservations('arcgis_features', body, { arcgis: fields })).toEqual([
      { seriesKey: 'PortWatch:chokepoint6:n_total', observedOn: '2026-10-31', value: 98, unit: null },
    ]);
    expect(() =>
      parseObservations('arcgis_features', body, { arcgis: { ...fields, valueFields: ['n_tanker'] } }),
    ).toThrow('ArcGIS response has no field(s): n_tanker.');
    expect(() => parseObservations('arcgis_features', body)).toThrow(ParseError);
  });

  it('refuses bodies that are not the declared format', () => {
    expect(() => parseObservations('fred_csv', '<html>blocked</html>')).toThrow(ParseError);
    expect(() => parseObservations('eia_v2', 'not json')).toThrow('The response is not valid JSON.');
  });
});
