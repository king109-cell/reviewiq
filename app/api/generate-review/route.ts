type Params = {
  businessName: string;
  businessType: string;
  synthesizedContext: string;   // the customer's real answers + notes
  starRating: number;
  language: string;
  area?: string;                // e.g. "Satellite", "CG Road" (optional)
  keywords?: string[];          // e.g. ["Neapolitan pizza", "cold coffee"] (optional)
};

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const STRUCTURES = [
  'Open with the specific item or moment, then one line about service, then a short closing thought.',
  'Open with the occasion or who they went with, then the main item, then how it ended up.',
  'Open with the service or atmosphere detail, then the food or product, then a short verdict.',
  'Write it as one flowing sentence with a short follow-up sentence.',
  'Open with the strongest opinion in plain words, then back it up with one concrete detail.',
];

const LENGTHS = [
  { words: '35 to 50', sentences: '2 to 3' },
  { words: '45 to 65', sentences: '3 to 4' },
  { words: '55 to 75', sentences: '3 to 4' },
];

function toneFor(r: number): string {
  if (r === 5) return 'Happy and genuine. Specific praise, not gushing. No exaggeration.';
  if (r === 4) return 'Positive, with one small honest caveat if the facts include one.';
  if (r === 3) return 'Balanced and fair. Name one thing that worked and one that did not.';
  return 'Calm, direct, factual. Say exactly what went wrong, with no insults, no accusations, and no claims beyond the stated facts.';
}

export function buildPrompt(p: Params): string {
  const len = r_len(p.starRating);
  const structure = pick(STRUCTURES);

  const seo = [
    p.area ? `Area: ${p.area}` : null,
    p.keywords?.length ? `Items/services the customer actually mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a real customer's feedback into a short Google Maps review in their own voice. They will read and edit it before posting.

BUSINESS: ${p.businessName} (${p.businessType})
${seo}

WHAT THE CUSTOMER ACTUALLY SAID (the only source of truth):
${p.synthesizedContext}

RATING: ${p.starRating}/5
TONE: ${toneFor(p.starRating)}

TRUTH RULES (highest priority)
- Use ONLY facts from the customer's input. Never invent dishes, prices, staff names, wait times, occasions, or companions.
- If the input is thin, write a shorter review. Do not pad with made-up detail.
- Never contradict the rating or any stated complaint.

STRUCTURE FOR THIS REVIEW: ${structure}
LENGTH: ${len.sentences} sentences, ${len.words} words.

SEO (natural only)
- Mention the business name at most once, and only if it fits naturally. Mention the area at most once.
- Include a specific item or service from the input if one exists.
- Never write phrases like "best cafe in [city]". No keyword lists. No repetition.

VOICE
- Sound like a real person typing on a phone: plain words, mild imperfection, contractions, uneven sentence lengths.
- Language: ${p.language || 'English'}. If it is Hindi or Gujarati, match how locals actually text (Latin script or mixed with English is fine if natural).
- Do not start with "I visited", "I went to", "I stopped by", or "As a customer".
- Forbidden words and phrases: scrumptious, devoured, unwind, exceeded expectations, nonetheless, overall, ambiance, spotless, top-notch, decent choice, hidden gem, must-visit, culinary journey, elevated, delightful, "a testament to", "highly recommend" (use at most a casual variant like "worth trying").
- No titles, emojis, hashtags, bullets, quotation marks, or em dashes. Never quote question labels.

Output ONLY the review text.`;
}

function r_len(rating: number) {
  const base = [
    { words: '35 to 50', sentences: '2 to 3' },
    { words: '45 to 65', sentences: '3 to 4' },
    { words: '55 to 75', sentences: '3 to 4' },
  ];
  const pool = rating <= 2 ? base.slice(0, 2) : base;
  return pool[Math.floor(Math.random() * pool.length)];
}