// Shared types for the Veil engine.

export type Category =
  | "PERSON" | "ORG" | "LOCATION" | "GOV_ID" | "FINANCIAL_ID" | "CONTACT"
  | "AMOUNT" | "DATE" | "HEALTH" | "SENSITIVE" | "QUASI" | "OTHER";

export const CATEGORIES: Category[] = [
  "PERSON", "ORG", "LOCATION", "GOV_ID", "FINANCIAL_ID", "CONTACT",
  "AMOUNT", "DATE", "HEALTH", "SENSITIVE", "QUASI", "OTHER",
];

export interface Span {
  start: number;
  end: number;
  text: string;
  category: Category;
  source: "rule" | "nano";
  /** Precise type from a rule pack, e.g. "PAN", "IBAN". Used for meaningful placeholders. */
  kind?: string;
  /** Which detector produced it (rule name, "direct", "indirect", "attacker"). */
  origin?: string;
  /** Canonical value this span refers to ("Arjun" → "Arjun Menon"), so both share one placeholder. */
  alias?: string;
}

export type RegionId = "IN" | "EU" | "UK" | "US";
