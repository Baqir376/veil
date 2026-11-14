// Privacy receipt: proof of what left the device — without containing any personal value.
import type { RegionId, VeilResult } from "../engine";

export interface Receipt {
  id: string;
  createdAt: string;
  region: RegionId;
  mode: VeilResult["mode"];
  degraded: boolean;
  /** How many values of each kind were held back on the device. */
  heldBack: Record<string, number>;
  onDevice: { stage: string; source?: string; ms: number; failed?: boolean }[];
  cloud: { source?: string; model: string; settings?: "remote" | "default" };
  /** SHA-256 of exactly what was sent (masked question + masked document). Lets anyone verify the payload later. */
  payloadSha256: string;
  payloadChars: number;
  residualClues: number;
  inventedPlaceholders: number;
  /** The final leak check ran on the exact payload; this many extra IDs were caught by it. */
  leakGate: { passed: true; autoMasked: number };
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildReceipt(args: {
  result: VeilResult; vault: Map<string, string>; payload: string;
  cloudSource?: string; invented: string[]; region: RegionId; gateAutoMasked: number; cloudModel: string; settings: "remote" | "default";
}): Promise<Receipt> {
  const heldBack: Record<string, number> = {};
  for (const id of args.vault.keys()) {
    const label = id.replace(/_\d+$/, "");
    heldBack[label] = (heldBack[label] ?? 0) + 1;
  }
  const last = args.result.rounds[args.result.rounds.length - 1];
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    region: args.region,
    mode: args.result.mode,
    degraded: args.result.degraded,
    heldBack,
    onDevice: args.result.stages.map((s) => ({ stage: s.stage, source: s.source, ms: s.ms, failed: s.failed })),
    cloud: { source: args.cloudSource, model: args.cloudModel, settings: args.settings },
    payloadSha256: await sha256(args.payload),
    payloadChars: args.payload.length,
    residualClues: last?.visible ?? 0,
    inventedPlaceholders: args.invented.length,
    leakGate: { passed: true, autoMasked: args.gateAutoMasked },
  };
}
