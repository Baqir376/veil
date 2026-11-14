// Synthetic test documents. Every name, number and ID below is invented.
// `expected` lists the strings a good detector must mask (ground truth for recall).

export interface Sample {
  id: string;
  label: string;
  region: "IN" | "EU" | "UK";
  text: string;
  expected: string[];
}

export const SAMPLES: Sample[] = [
  {
    id: "in-tax-notice",
    label: "🇮🇳 Income-tax notice forwarded by a client",
    region: "IN",
    text: `Hi CA Priya ji,

Please see the notice below and tell me how to reply. I am really worried.

"To: Rohan Mehta, PAN BQRPM4821K, Aadhaar 4821 7733 9045
Address: Flat 302, Sai Krupa Apartments, Kothrud, Pune 411038
Subject: Notice u/s 143(1)(a) for AY 2026-27
The income of Rs 18,45,000 reported in your ITR does not match Form 26AS which shows Rs 21,10,500.
Interest of Rs 2,65,500 from HDFC Bank a/c 50100234567812 (IFSC HDFC0001234) appears unreported."

My salary is from Infosys and I also got rent from my second flat. My wife Sneha handles the FD.
Call me on 9822014567 or rohan.mehta88@gmail.com. UPI me the fee at rohanm@okhdfcbank.`,
    expected: [
      "Rohan Mehta", "BQRPM4821K", "4821 7733 9045", "Flat 302, Sai Krupa Apartments",
      "411038", "18,45,000", "21,10,500", "2,65,500", "50100234567812", "HDFC0001234",
      "Infosys", "Sneha", "9822014567", "rohan.mehta88@gmail.com", "rohanm@okhdfcbank",
    ],
  },
  {
    id: "in-quasi",
    label: "🇮🇳 Indirect identifiers only (no names)",
    region: "IN",
    text: `Need advice on a GST mismatch for a client. She is the only woman-owned
ayurvedic pharmacy in Chiplun, opened right next to the Parshuram temple in 2019.
She was on the front page of Lokmat last March after her son won the state chess title.
Her GSTIN is 27AAPFU0939F1ZV and turnover crossed Rs 2.3 crore this year.`,
    expected: [
      "only woman-owned", "ayurvedic pharmacy in Chiplun", "Parshuram temple",
      "front page of Lokmat", "son won the state chess title", "27AAPFU0939F1ZV", "2.3 crore",
    ],
  },
  {
    id: "eu-invoice",
    label: "🇪🇺 Freelancer invoice dispute (Germany)",
    region: "EU",
    text: `Hello, can you help me write a firm reply to my client?

I am Lena Hoffmann, a freelance UX designer in Leipzig (USt-IdNr. DE287654321).
Invoice #2026-114 for EUR 7,800 to Brandt & Söhne GmbH is 60 days overdue.
Please pay to IBAN DE89 3704 0044 0532 0130 00, BIC COBADEFFXXX.
Their CFO Markus Brandt keeps promising payment "next week".
Reach me at +49 151 23456789.`,
    expected: [
      "Lena Hoffmann", "Leipzig", "DE287654321", "Brandt & Söhne GmbH",
      "DE89 3704 0044 0532 0130 00", "COBADEFFXXX", "Markus Brandt", "+49 151 23456789",
    ],
  },
  {
    id: "uk-hr",
    label: "🇬🇧 HR note about an employee",
    region: "UK",
    text: `Summarise this for the board, keep it neutral:

James O'Connor (NI number JK 48 21 93 C), our only Gaelic-speaking engineer in the
Inverness office, has been signed off for 6 weeks with depression after his divorce.
His manager Aisha Khan wants to start a capability review. NHS number 943 476 5919.`,
    expected: [
      "James O'Connor", "JK 48 21 93 C", "only Gaelic-speaking engineer", "Inverness",
      "depression", "divorce", "Aisha Khan", "943 476 5919",
    ],
  },
];
