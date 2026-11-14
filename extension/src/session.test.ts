import { describe, it, expect } from "vitest";
import { SessionVault } from "./session";
import { runVeil } from "../../src/engine";

const run = (t: string) => runVeil(t, { regions: ["IN"], detector: null });

describe("extension session vault", () => {
  it("keeps placeholders stable across pastes, and numbers new values after old ones", async () => {
    const v = new SessionVault();
    const a = "Client: Rohan Mehta, PAN BQRPM4821K.";
    const ra = await run(a);
    const pa = v.protect(a, ra.spans, ra.packs);
    expect(pa.masked).toBe("Client: [PERSON_1], PAN [PAN_1].");

    const b = "Also Dear Sneha Mehta, and Rohan Mehta's PAN BQRPM4821K again; new PAN ABCPN1234D.";
    const rb = await run(b);
    const pb = v.protect(b, rb.spans, rb.packs);
    expect(pb.masked).toContain("[PERSON_2]");          // Sneha is new → 2
    expect(pb.masked).toContain("[PAN_1] again");       // same PAN → same tag
    expect(pb.masked).toContain("[PAN_2]");             // new PAN → 2
    expect(pb.masked).not.toMatch(/Rohan|Sneha|BQRPM4821K|ABCPN1234D/);
  });

  it("restores the AI's answer, any case, ignoring unknown tags", async () => {
    const v = new SessionVault();
    const t = "Client: Rohan Mehta, PAN BQRPM4821K.";
    const r = await run(t);
    v.protect(t, r.spans, r.packs);
    expect(v.restore("Dear [person_1], your [PAN_1] is fine. See [ORG_9].")).toBe("Dear Rohan Mehta, your BQRPM4821K is fine. See [ORG_9].");
    expect(v.restore("Nothing to restore here.")).toBeNull();
  });

  it("never reuses a placeholder that was already in the user's own text", async () => {
    const v = new SessionVault();
    const t = "Template: Dear [PERSON_1]. Client: Rohan Mehta.";
    const r = await run(t);
    const p = v.protect(t, r.spans, r.packs);
    expect(p.masked).toBe("Template: Dear [PERSON_1]. Client: [PERSON_2].");
  });
});
