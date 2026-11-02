/** Data retention (D-126): the only data classes a purge can touch; everything a number or decision cites is out of scope. */
export const RETENTION_CLASSES = ['import_row_issues', 'closed_interventions'] as const;
export type RetentionClass = (typeof RETENTION_CLASSES)[number];
