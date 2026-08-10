// docs/DATA_CLASSIFICATION.md Section 2.
export const DATA_CLASSIFICATIONS = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
] as const;

export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];
