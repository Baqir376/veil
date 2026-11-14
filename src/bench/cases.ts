// Veil benchmark: synthetic, seeded, reproducible. All names, IDs and numbers are generated.
// Design follows the shift taxonomy of "Mind the Gap: Robustness Risks in PII Detection Systems"
// (arXiv 2609.03464) — category × template × instance — plus obfuscation, structured, quasi-identifier
// and negative (nothing-to-mask) categories. Every case lists what MUST be masked and what MUST stay
// visible, so we measure both leaks (recall) and over-masking (utility).
import type { RegionId } from "../engine";

export type BenchCategory =
  | "clean" | "run-on" | "conversational" | "abbreviations" | "typos" | "code-switched"
  | "ambiguous-names" | "obfuscated" | "structured" | "quasi" | "eu-uk" | "negative";

export interface BenchCase {
  id: string;
  category: BenchCategory;
  region: RegionId;
  text: string;
  /** Strings that must NOT appear in what the cloud sees. */
  must: string[];
  /** Strings that MUST still appear (domain terms the cloud needs). */
  keep: string[];
}

// ---------- seeded RNG ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- pools ----------
const FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Vihaan", "Ananya", "Arjun", "Isha", "Reyansh", "Saanvi", "Advait", "Kiara",
  "Vivaan", "Myra", "Ayaan", "Nikhil", "Pallavi", "Tanmay", "Shruti", "Omkar", "Farhan", "Zainab", "Gurpreet", "Lakshmi"];
const LAST = ["Shah", "Patel", "Rao", "Nair", "Gupta", "Iyer", "Menon", "Reddy", "Joshi", "Kulkarni", "Desai", "Bhat",
  "Pillai", "Sinha", "Chopra", "Deshpande", "Khan", "Singh", "Banerjee", "Fernandes"];
const EU_FIRST = ["Lena", "Jonas", "Clara", "Matteo", "Sofia", "Lucas", "Ines", "Pieter", "Elena", "Mathieu"];
const EU_LAST = ["Hoffmann", "Becker", "Rossi", "Dubois", "Jansen", "García", "Novak", "Schneider", "Moreau", "Kowalski"];
const PLACES = ["Kothrud", "Andheri East", "Salt Lake", "Koramangala", "Banjara Hills", "Aundh", "Malviya Nagar", "Navrangpura", "Ratnagiri", "Dapoli"];
const CITIES = ["Pune", "Mumbai", "Kolkata", "Bengaluru", "Hyderabad", "Jaipur", "Ahmedabad", "Nagpur"];
const ORGS = ["Infosys", "Tata Motors", "Wipro", "HDFC Bank", "Bajaj Finserv", "Larsen & Toubro", "Asian Paints", "Zomato"];
const EU_ORGS = ["Brandt & Söhne GmbH", "Vogel Logistik AG", "Rossi Design Srl", "Dubois Conseil SARL"];
const WORD_NAMES = ["Rose", "Grace", "Sunny", "Hope", "Joy", "Faith", "Rain", "Summer", "Ruby", "Pearl"];
const RARE_JOBS = ["only female cardiologist", "only Parsi woman sarpanch", "only deaf chartered accountant", "first woman pilot", "only Michelin-trained chef"];
const SMALL_TOWNS = ["Chiplun", "Malvan", "Dapoli", "Sawantwadi", "Kudal", "Alibag"];
const EVENTS = ["twins topped the state board exams", "son won the national chess title", "daughter was on Shark Tank India", "husband won the panchayat election"];

const DIGIT_WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

// ---------- ID generators (valid formats; Aadhaar passes Verhoeff, cards pass Luhn) ----------
const VD = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const VP = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const VINV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

class Gen {
  r: () => number;
  constructor(seed: number) { this.r = mulberry32(seed); }
  int(n: number) { return Math.floor(this.r() * n); }
  pick<T>(a: T[]): T { return a[this.int(a.length)]; }
  digits(n: number) { return Array.from({ length: n }, () => this.int(10)).join(""); }
  letters(n: number) { return Array.from({ length: n }, () => String.fromCharCode(65 + this.int(26))).join(""); }
  name() { return `${this.pick(FIRST)} ${this.pick(LAST)}`; }
  euName() { return `${this.pick(EU_FIRST)} ${this.pick(EU_LAST)}`; }
  pan() { return `${this.letters(3)}P${this.letters(1)}${this.digits(4)}${this.letters(1)}`; }
  aadhaar() {
    const body = `${2 + this.int(8)}${this.digits(10)}`;
    let c = 0;
    const rev = [...body].reverse().map(Number);
    for (let i = 0; i < rev.length; i++) c = VD[c][VP[(i + 1) % 8][rev[i]]];
    const full = body + VINV[c];
    return `${full.slice(0, 4)} ${full.slice(4, 8)} ${full.slice(8)}`;
  }
  phone() { return `${6 + this.int(4)}${this.digits(9)}`; }
  card() {
    const body = `4${this.digits(14)}`;
    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      let d = +body[body.length - 1 - i];
      if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    const full = body + ((10 - (sum % 10)) % 10);
    return full.match(/.{4}/g)!.join(" ");
  }
  iban() { return `DE${this.digits(2)} ${this.digits(4)} ${this.digits(4)} ${this.digits(4)} ${this.digits(4)} ${this.digits(2)}`; }
  ifsc() { return `${this.letters(4)}0${this.digits(6)}`; }
  amount() { return `${1 + this.int(40)},${this.digits(2)},${this.digits(3)}`; }
  email(n: string) { return `${n.split(" ")[0].toLowerCase()}.${n.split(" ")[1].toLowerCase()}${this.int(90) + 10}@gmail.com`; }
}

const typo = (w: string, g: Gen) => {
  if (w.length < 4) return w;
  const i = 1 + g.int(w.length - 2);
  return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
};

// ---------- templates ----------
type T = (g: Gen) => Omit<BenchCase, "id" | "category">;

const TEMPLATES: Record<BenchCategory, T[]> = {
  clean: [
    (g) => { const n = g.name(), p = g.pan(), a = g.aadhaar(), ph = g.phone();
      return { region: "IN", text: `Dear ${n}, your PAN ${p} has been linked to Aadhaar ${a}. For queries call ${ph}.`, must: [n, p, a, ph], keep: ["PAN", "Aadhaar"] }; },
    (g) => { const n = g.name(), o = g.pick(ORGS), c = g.pick(CITIES), amt = g.amount();
      return { region: "IN", text: `${n} from ${o} in ${c} has requested a refund of Rs ${amt} for AY 2026-27.`, must: [n, amt], keep: ["AY 2026-27"] }; },
    (g) => { const n = g.name(), acct = g.digits(14), ifsc = g.ifsc();
      return { region: "IN", text: `Please credit the amount to ${n}, a/c ${acct}, IFSC ${ifsc}.`, must: [n, acct, ifsc], keep: ["IFSC"] }; },
    (g) => { const n = g.name(), e = g.email(n);
      return { region: "IN", text: `Client ${n} (${e}) received a notice u/s 143(1)(a) for AY 2026-27.`, must: [n, e], keep: ["u/s 143(1)(a)", "AY 2026-27"] }; },
  ],
  "run-on": [
    (g) => { const n = g.name(), pl = g.pick(PLACES), p = g.pan(), ph = g.phone();
      return { region: "IN", text: `my name is ${n.toLowerCase()} i live in ${pl.toLowerCase()} my pan is ${p} call me on ${ph} thanks`, must: [n.toLowerCase(), p, ph], keep: [] }; },
    (g) => { const n = g.name(), o = g.pick(ORGS), e = g.email(n), ph = g.phone();
      return { region: "IN", text: `hi this is ${n} from ${o} my email is ${e} please call ${ph} asap regarding the gst refund`, must: [n, e, ph], keep: ["gst"] }; },
  ],
  conversational: [
    (g) => { const n = g.name(), o = g.pick(ORGS), amt = g.amount();
      return { region: "IN", text: `ugh so my manager ${n} at ${o} says my salary of Rs ${amt} can't be revised this year 🙄 what are my options?`, must: [n, amt], keep: [] }; },
    (g) => { const n = g.name(), pl = g.pick(PLACES), upi = `${n.split(" ")[0].toLowerCase()}${g.int(99)}@okicici`;
      return { region: "IN", text: `my landlord ${n} in ${pl} keeps asking for rent in cash, his UPI is ${upi}. is that legal??`, must: [n, upi], keep: ["UPI"] }; },
  ],
  abbreviations: [
    (g) => { const n = g.name(), ph = g.phone(), pl = g.pick(PLACES), p = g.pan();
      return { region: "IN", text: `nm: ${n} | ph: ${ph} | addr: ${pl}, ${g.pick(CITIES)} | pan: ${p}`, must: [n, ph, p], keep: [] }; },
    (g) => { const n = g.name(), acct = g.digits(12), ifsc = g.ifsc(), amt = g.amount();
      return { region: "IN", text: `Cust ${n} a/c no ${acct} IFSC ${ifsc} bal Rs ${amt} – pls chk TDS`, must: [n, acct, ifsc, amt], keep: ["TDS"] }; },
  ],
  typos: [
    (g) => { const f = g.pick(FIRST), l = g.pick(LAST), tn = `${typo(f, g)} ${typo(l, g)}`, ph = g.phone();
      return { region: "IN", text: `hello my nmae is ${tn} adn i wrok at ${g.pick(ORGS)}, my phnoe is ${ph}`, must: [tn, ph], keep: [] }; },
    (g) => { const n = g.name(), p = g.pan();
      return { region: "IN", text: `Plz fnid attchd ITR of ${n}, PAN ${p}, for AY 2026-27`, must: [n, p], keep: ["ITR", "AY 2026-27"] }; },
  ],
  "code-switched": [
    (g) => { const n = g.name(), p = g.pan(), pl = g.pick(PLACES);
      return { region: "IN", text: `${n.split(" ")[0]} bhai ka PAN ${p} hai, ${pl} mein rehta hai, unka ITR file karna hai`, must: [n.split(" ")[0], p, pl], keep: ["PAN", "ITR"] }; },
    (g) => { const n = g.name(), ph = g.phone();
      return { region: "IN", text: `mera naam ${n} hai aur mera number ${ph} hai, GST refund kab aayega?`, must: [n, ph], keep: ["GST"] }; },
  ],
  "ambiguous-names": [
    (g) => { const w = g.pick(WORD_NAMES), l = g.pick(LAST);
      return { region: "IN", text: `Please ask ${w} ${l} from accounts to approve the invoice by Friday.`, must: [`${w} ${l}`], keep: ["invoice", "Friday"] }; },
    (g) => { const w = g.pick(WORD_NAMES), o = g.pick(ORGS);
      return { region: "IN", text: `${w} said the ${o} payment came in late, but ${w} will reconcile it.`, must: [w], keep: ["payment"] }; },
  ],
  obfuscated: [
    (g) => { const n = g.name(), u = n.split(" ")[0].toLowerCase();
      return { region: "IN", text: `Reach ${n} at ${u} [at] gmail [dot] com`, must: [n, `${u} [at] gmail [dot] com`], keep: [] }; },
    (g) => { const ph = g.phone(), sp = [...ph].map((d) => DIGIT_WORD[+d]).join(" ");
      return { region: "IN", text: `WhatsApp me on ${sp} after 6pm.`, must: [sp], keep: ["WhatsApp"] }; },
    (g) => { const p = g.pan(), zw = `${p.slice(0, 5)}​${p.slice(5)}`;
      return { region: "IN", text: `PAN: ${zw} (please verify)`, must: [zw], keep: ["PAN"] }; },
    (g) => { const a = g.aadhaar(), fw = [...a].map((c) => (/\d/.test(c) ? String.fromCharCode(0xff10 + +c) : c)).join("");
      return { region: "IN", text: `Aadhaar ${fw} attached.`, must: [fw], keep: ["Aadhaar"] }; },
  ],
  structured: [
    (g) => { const a = g.name(), b = g.name(), pa = g.pan(), pb = g.pan(), sa = `${1 + g.int(30)}00000`, sb = `${1 + g.int(30)}50000`;
      return { region: "IN", text: `name,pan,salary\n${a},${pa},${sa}\n${b},${pb},${sb}`, must: [a, b, pa, pb, sa, sb], keep: ["salary"] }; },
    (g) => { const n = g.name(), e = g.email(n), c = g.card();
      return { region: "IN", text: `{"customer":{"name":"${n}","email":"${e}","card":"${c}"}}`, must: [n, e, c], keep: [] }; },
    (g) => { const a = g.name(), b = g.name(), ph = g.phone();
      return { region: "IN", text: `From: ${a} <${g.email(a)}>\nTo: ${b}\nSubject: ITR query\n\n${b.split(" ")[0]}, please call me on ${ph}.\n--\n${a}`, must: [a, b, b.split(" ")[0], ph], keep: ["ITR"] }; },
  ],
  quasi: [
    (g) => { const j = g.pick(RARE_JOBS), t = g.pick(SMALL_TOWNS), ev = g.pick(EVENTS);
      return { region: "IN", text: `My client is the ${j} in ${t}. Last year her ${ev}. She wants advice on 80C.`, must: [j, t], keep: ["80C"] }; },
    (g) => { const t = g.pick(SMALL_TOWNS);
      return { region: "IN", text: `He runs the only pharmacy next to the old temple in ${t} and was diagnosed with Parkinson's last year.`, must: [t, "Parkinson's"], keep: [] }; },
  ],
  "eu-uk": [
    (g) => { const n = g.euName(), ib = g.iban(), o = g.pick(EU_ORGS);
      return { region: "EU", text: `Invoice from ${n}: please pay EUR 7,800 to IBAN ${ib}. Client: ${o}.`, must: [n, ib, o], keep: ["IBAN", "Invoice"] }; },
    (g) => { const n = g.euName(), ni = `JK ${g.digits(2)} ${g.digits(2)} ${g.digits(2)} C`;
      return { region: "UK", text: `${n} (NI number ${ni}) was signed off by her GP for six weeks.`, must: [n, ni], keep: ["NI number"] }; },
  ],
  negative: [
    () => ({ region: "IN", text: "What is the deduction limit under Section 80C and 80D for AY 2026-27?", must: [], keep: ["Section 80C", "80D", "AY 2026-27"] }),
    () => ({ region: "IN", text: "Explain the difference between Form 26AS, AIS and TIS in simple words.", must: [], keep: ["Form 26AS", "AIS", "TIS"] }),
    (g) => ({ region: "IN", text: `Order ${g.digits(12)} shipped on Monday; GST rate is 18% and the HSN code is 8471.`, must: [], keep: ["Monday", "GST", "18%", "8471"] }),
    () => ({ region: "IN", text: "Open the page in Microsoft Edge, turn Wi-Fi back on and press Ask again.", must: [], keep: ["Microsoft Edge", "Wi-Fi", "Ask"] }),
    () => ({ region: "EU", text: "Under GDPR Article 17, how fast must a company delete data after a request?", must: [], keep: ["GDPR Article 17"] }),
  ],
};

/** Build the benchmark: every template × `perTemplate` seeded instances. */
export function buildBenchmark(perTemplate = 4, seed = 2026): BenchCase[] {
  const out: BenchCase[] = [];
  let s = seed;
  for (const [category, templates] of Object.entries(TEMPLATES) as [BenchCategory, T[]][]) {
    templates.forEach((tpl, ti) => {
      const n = category === "negative" ? 1 : perTemplate;
      for (let k = 0; k < n; k++) {
        const c = tpl(new Gen(s++));
        out.push({ id: `${category}-${ti + 1}-${k + 1}`, category, ...c });
      }
    });
  }
  return out;
}
