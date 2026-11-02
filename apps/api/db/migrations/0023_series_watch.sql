-- TIGERIS AI OS — schema v23 (D-127, slice L2): watch rules may watch a fetched data series falling below its own
-- recent level (for example daily transits through the Strait of Hormuz).
ALTER TABLE watch_rules DROP CONSTRAINT watch_rules_kind_check;
ALTER TABLE watch_rules ADD CONSTRAINT watch_rules_kind_check
  CHECK (kind IN ('semantic','signal_untriaged','connector_stale','decision_drift','decision_monitor',
                  'validation_overdue','series_drop'));
