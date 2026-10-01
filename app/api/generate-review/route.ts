import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseServer';

type AnswerItem = {
  question: string;
  answer: string;
  type?: 'mcq' | 'text' | string;
};

type PromptParams = {
  businessName: string;
  businessType: string;
  synthesizedContext: string;
  starRating: number;
  language: string;
  area?: string;
  keywords?: string[];
};

const MAX_REVIEWS_PER_HOUR = 60;

// Rate limiting using Supabase DB count (serverless safe)
async function checkDbRateLimit(businessId: string): Promise<boolean> {
  try {
    const supabase = createSupabaseAdmin();
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

    const { count, error } = await supabase
      .from('review_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', oneHourAgo);

    if (error || count === null) return true; // Fail open if DB query issues arise
    return count < MAX_REVIEWS_PER_HOUR;
  } catch {
    return true;
  }
}

// 1. CONTEXT SYNTHESIZER
// Text answers are the customer's own words (top priority).
// Everything else is a list of selected choices.
function synthesizeAnswers(answers: AnswerItem[]): string {
  return answers
    .map((item) => {
      const q = item.question.trim();
      const a = item.answer.trim();
      if (!a) return null;

      if (item.type === 'text') {
        return `Customer's own words (highest priority, keep their phrasing): ${a}`;
      }
      return `${q}: ${a}`;
    })
    .filter(Boolean)
    .join('\n');
}

// Pull what the customer ordered from the answers (used as SEO keywords).
// Safe because it comes straight from the customer, nothing is invented.
function extractOrderedItems(answers: AnswerItem[]): string[] {
  const orderAnswer = answers.find(
    (a) => a.type !== 'text' && /order|eat|drink/i.test(a.question)
  );
  if (!orderAnswer) return [];
  return orderAnswer.answer
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 40)
    .slice(0, 4);
}

// Dynamically fetch available Groq models with fallback priority ordering
async function getActiveGroqModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch models: HTTP ${res.status}`);
    }

    const data = await res.json();
    const models: string[] = (data.data || [])
      .map((m: { id: string }) => m.id)
      .filter((id: string) => !id.includes('whisper') && !id.includes('vision') && !id.includes('safetensors'));

    const priorityOrder = [
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
    ];

    const sortedModels = models.sort((a, b) => {
      const idxA = priorityOrder.indexOf(a);
      const idxB = priorityOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

    return sortedModels.length > 0 ? sortedModels : ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  } catch (err: any) {
    console.warn('Could not fetch active models dynamically from Groq, using defaults:', err.message);
    return ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
  }
}

// 2. PROMPT BUILDER (randomized structure + length, truth rules, safe SEO)
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const STRUCTURES = [
  'Open with the specific item or moment, then one line about service, then a short closing thought.',
  'Open with who they came with, then the main item, then how it ended up.',
  'Open with a service or place detail, then the food or drink, then a short verdict.',
  'Write it as one flowing sentence with a short follow-up sentence.',
  'Open with the strongest opinion in plain words, then back it up with one concrete detail.',
];

const LENGTHS = [
  { words: '35 to 50', sentences: '2 to 3' },
  { words: '45 to 65', sentences: '3 to 4' },
  { words: '55 to 75', sentences: '3 to 4' },
];

function toneFor(r: number): string {
  if (r >= 5) return 'Happy and genuine. Specific praise, not gushing. No exaggeration.';
  if (r === 4) return 'Positive, with one small honest caveat if the facts include one.';
  if (r === 3) return 'Balanced and fair. Name one thing that worked and one that did not.';
  return 'Calm, direct, factual. Say exactly what went wrong, with no insults, no accusations, and no claims beyond the stated facts.';
}

function pickLength(rating: number) {
  const pool = rating <= 2 ? LENGTHS.slice(0, 2) : LENGTHS;
  return pick(pool);
}

function buildPrompt(p: PromptParams): string {
  const len = pickLength(p.starRating);
  const structure = pick(STRUCTURES);

  const seo = [
    p.area ? `Area: ${p.area}` : null,
    p.keywords?.length
      ? `Items the customer actually mentioned: ${p.keywords.join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

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
- If any selected fact conflicts with the star rating, follow the star rating for the overall tone and mention the conflicting fact only briefly as a small side note.
- If the customer's own words are given, use their phrasing and keep it close to how they wrote it.

STRUCTURE FOR THIS REVIEW: ${structure}
LENGTH: ${len.sentences} sentences, ${len.words} words.

SEO (natural only)
- Mention the business name at most once, and only if it fits naturally. Mention the area at most once.
- Include a specific item from the input if one exists.
- Never write phrases like "best cafe in [city]". No keyword lists. No repetition.

VOICE
- Sound like a real person typing on a phone: plain words, mild imperfection, contractions, uneven sentence lengths.
- Language: ${p.language || 'English'}. If it is Hindi or Gujarati, match how locals actually text (Latin script or mixed with English is fine if natural).
- Do not start with "I visited", "I went to", "I stopped by", or "As a customer".
- Forbidden words and phrases: scrumptious, devoured, unwind, exceeded expectations, nonetheless, overall, ambiance, spotless, top-notch, decent choice, hidden gem, must-visit, culinary journey, elevated, delightful, "a testament to", "highly recommend" (use at most a casual variant like "worth trying").
- No titles, emojis, hashtags, bullets, quotation marks, or em dashes. Never quote question labels.

Output ONLY the review text.`;
}

// 3. GROQ AI GENERATOR
async function generateWithGroq(prompt: string, apiKey: string): Promise<string> {
  const availableModels = await getActiveGroqModels(apiKey);
  let lastError: Error | null = null;

  for (const model of availableModels) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You write short, natural Google Maps reviews in a real customer\'s voice, based only on the facts given. You never output titles, headlines, emojis, corporate buzzwords, or formal phrasing. Output ONLY the raw review text.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.9,
          top_p: 0.92,
          max_tokens: 300, // Hindi/Gujarati use more tokens per word
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const errorMessage = err.error?.message || `Groq status ${response.status}`;
        console.warn(`Model ${model} returned error: ${errorMessage}. Trying next model...`);
        lastError = new Error(errorMessage);
        continue;
      }

      const data = await response.json();
      const review = data.choices?.[0]?.message?.content?.trim();

      if (review && review.length >= 25) {
        return review;
      }
    } catch (err: any) {
      console.warn(`Attempt failed with model ${model}:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('All AI models failed to generate response. Please check GROQ_API_KEY.');
}

// 4. SANITIZER
function fixReview(review: string): string {
  let fixed = review.trim();

  // Strip headline lines like "Great spot at Cafe Name:"
  fixed = fixed.replace(/^([^.\n!?]+(?:at|@)[^.\n!?]+[\n\r:]+)/gi, '');

  // Remove label prefixes (e.g. "Title:", "Review:")
  fixed = fixed.replace(/^(Title|Review|Option|\d+[\.\)]|\#+)\s*:\s*/gi, '');
  fixed = fixed.replace(/^\d+\.\s*/gm, '');

  // Strip emojis only (keeps the rupee sign, apostrophes, Hindi and Gujarati text)
  fixed = fixed.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');

  // Em and en dashes become a comma, never glue words together
  fixed = fixed.replace(/\s*[—–]\s*/g, ', ');

  // Markdown, surrounding quotes, extra spaces
  fixed = fixed
    .replace(/^["'«“]|["'»”]$/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/^[-•]\s/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove repetitive location descriptors
  fixed = fixed
    .replace(/,\s*a\s+local\s+Indian\s+restaurant/gi, '')
    .replace(/,\s*an\s+Indian\s+restaurant/gi, '')
    .replace(/\s+in\s+India\b/gi, '')
    .replace(/\s+Indian\s+spot\b/gi, ' spot');

  // Cut a dangling half sentence (supports Hindi danda too)
  const lastPunct = Math.max(
    fixed.lastIndexOf('.'),
    fixed.lastIndexOf('!'),
    fixed.lastIndexOf('?'),
    fixed.lastIndexOf('।')
  );
  if (lastPunct > 20 && lastPunct < fixed.length - 1) {
    fixed = fixed.substring(0, lastPunct + 1);
  }

  return fixed.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      businessName,
      businessType,
      businessId,
      language = 'English',
      answers,
      starRating,
      area,       // optional, e.g. "Satellite"
      keywords,   // optional, string[] set by the owner
    } = body;

    if (!businessName || !businessType || !answers || !businessId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'AI service missing configuration key' }, { status: 500 });
    }

    const rating = Math.min(5, Math.max(1, Number(starRating) || 5));

    const validAnswers: AnswerItem[] = Array.isArray(answers)
      ? answers.filter((qa: AnswerItem) => qa.answer && qa.answer.trim().length > 0)
      : [];

    if (validAnswers.length === 0) {
      return NextResponse.json({ error: 'Please provide at least one answer.' }, { status: 400 });
    }

    const isAllowed = await checkDbRateLimit(businessId);
    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Rate limit reached for this business. Please try again later.' },
        { status: 429 }
      );
    }

    const synthesizedContext = synthesizeAnswers(validAnswers);

    // Owner keywords first, otherwise use what the customer said they ordered
    const ownerKeywords: string[] = Array.isArray(keywords)
      ? keywords.filter((k: unknown) => typeof k === 'string').slice(0, 4)
      : [];
    const finalKeywords = ownerKeywords.length ? ownerKeywords : extractOrderedItems(validAnswers);

    const prompt = buildPrompt({
      businessName,
      businessType,
      synthesizedContext,
      starRating: rating,
      language,
      area: typeof area === 'string' && area.trim() ? area.trim() : undefined,
      keywords: finalKeywords,
    });

    const raw = await generateWithGroq(prompt, process.env.GROQ_API_KEY);
    const review = fixReview(raw);

    if (!review || review.length < 25) {
      return NextResponse.json(
        { error: 'Could not generate a valid review. Please try again.' },
        { status: 500 }
      );
    }

    const supabase = createSupabaseAdmin();
    const { data: session } = await supabase
      .from('review_sessions')
      .insert({
        business_id: businessId,
        language,
        answers: validAnswers,
        generated_review: review,
        star_rating: rating,
        posted: false,
      })
      .select('id')
      .single();

    return NextResponse.json({ review, sessionId: session?.id || null });
  } catch (err: any) {
    console.error('Final API Handler error:', err.message);
    return NextResponse.json(
      { error: err.message || 'Failed to generate review.' },
      { status: 500 }
    );
  }
}