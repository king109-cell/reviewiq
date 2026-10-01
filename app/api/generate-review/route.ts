import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseServer';

type AnswerItem = {
  question: string;
  answer: string;
  type?: 'mcq' | 'text' | string;
};

type Params = {
  businessName: string;
  businessType: string;
  synthesizedContext: string;
  starRating: number;
  language: string;
  area?: string;
  keywords?: string[];
};

// ============================================================================
// 1. HELPER FUNCTIONS & PROMPT CONFIGURATION
// ============================================================================

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const STRUCTURES = [
  'Open with the specific item or moment, then one line about service, then a short closing thought.',
  'Open with the occasion or who they went with, then the main item, then how it ended up.',
  'Open with the service or atmosphere detail, then the food or product, then a short verdict.',
  'Write it as one flowing sentence with a short follow-up sentence.',
  'Open with the strongest opinion in plain words, then back it up with one concrete detail.',
];

function r_len(rating: number) {
  const base = [
    { words: '35 to 50', sentences: '2 to 3' },
    { words: '45 to 65', sentences: '3 to 4' },
    { words: '55 to 75', sentences: '3 to 4' },
  ];
  const pool = rating <= 2 ? base.slice(0, 2) : base;
  return pool[Math.floor(Math.random() * pool.length)];
}

function toneFor(r: number): string {
  if (r === 5) return 'Happy and genuine. Specific praise, not gushing. No exaggeration.';
  if (r === 4) return 'Positive, with one small honest caveat if the facts include one.';
  if (r === 3) return 'Balanced and fair. Name one thing that worked and one that did not.';
  return 'Calm, direct, factual. Say exactly what went wrong, with no insults, no accusations, and no claims beyond the stated facts.';
}

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
    return count < 60; // Up to 60 generated reviews per hour per business
  } catch {
    return true;
  }
}

// Translates raw QA pairs into rich conversational context
function synthesizeAnswers(answers: AnswerItem[]): string {
  return answers
    .map((item, index) => {
      const q = item.question.trim();
      const a = item.answer.trim();

      if (!a) return null;

      const isTextAnswer = item.type === 'text' || a.length > 25 || a.includes(' ');

      if (isTextAnswer) {
        return `[Fact ${index + 1}] Regarding "${q}": The customer specifically noted: "${a}"`;
      } else {
        return `[Fact ${index + 1}] Question: "${q}" -> Selected Choice: "${a}"`;
      }
    })
    .filter(Boolean)
    .join('\n');
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

// ============================================================================
// 2. ISOLATED PROMPT BUILDERS BY BUSINESS CATEGORY
// ============================================================================

// PROMPT A: CAFE & RESTAURANT PROMPT
function buildCafeRestaurantPrompt(p: Params): string {
  const len = r_len(p.starRating);
  const structure = pick(STRUCTURES);

  const seo = [
    p.area ? `Area: ${p.area}` : null,
    p.keywords?.length ? `Items/services the customer actually mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a real customer's feedback into a short Google Maps review in their own voice for a Cafe / Restaurant.

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
- Forbidden words and phrases: scrumptious, devoured, unwind, exceeded expectations, nonetheless, overall, ambiance, spotless, top-notch, decent choice, hidden gem, must-visit, culinary journey, elevated, delightful, "a testament to", "highly recommend" (use at most a casual variant like "worth stopping by" or "will visit again").
- No titles, emojis, hashtags, bullets, quotation marks, or em dashes. Never quote question labels.

Output ONLY the review text.`;
}

// PROMPT B: CLINIC & HEALTHCARE PROMPT
function buildClinicPrompt(p: Params): string {
  const len = r_len(p.starRating);
  const structure = pick(STRUCTURES);

  const seo = [
    p.area ? `Area: ${p.area}` : null,
    p.keywords?.length ? `Services/treatments the patient actually mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a real patient's feedback into a short Google Maps review in their own voice for a Healthcare Clinic / Doctor.

BUSINESS: ${p.businessName} (${p.businessType})
${seo}

WHAT THE PATIENT ACTUALLY SAID (the only source of truth):
${p.synthesizedContext}

RATING: ${p.starRating}/5
TONE: ${toneFor(p.starRating)}

TRUTH RULES (highest priority)
- Use ONLY facts from the patient's input. Never invent treatments, procedures, doctor names, diagnoses, prices, or wait times.
- If the input is thin, write a shorter review. Do not pad with made-up detail.
- Never contradict the rating or any stated complaint.

STRUCTURE FOR THIS REVIEW: ${structure}
LENGTH: ${len.sentences} sentences, ${len.words} words.

HEALTHCARE SPECIFIC RULES:
- Focus on doctor/staff demeanor, treatment clarity, hygiene, or queue management.
- NEVER use dining terms like "delicious", "scrumptious", or "taste".
- NEVER use casual dining closing phrases like "can't wait to visit again", "coming back every week", or "tasty". Use patient trust variants like "glad to have found a good doctor" or "felt in good hands".

VOICE
- Sound like a real patient typing on a phone: plain words, mild imperfection, contractions.
- Language: ${p.language || 'English'}. If it is Hindi or Gujarati, match how locals actually text.
- Do not start with "I visited", "I went to", "I stopped by", or "As a patient".
- Forbidden words and phrases: exceeded expectations, nonetheless, overall, spotless, top-notch, hidden gem, "a testament to", "highly recommend".
- No titles, emojis, hashtags, bullets, quotation marks, or em dashes.

Output ONLY the review text.`;
}

// PROMPT C: GENERAL BUSINESS FALLBACK PROMPT
function buildGeneralPrompt(p: Params): string {
  const len = r_len(p.starRating);
  const structure = pick(STRUCTURES);

  const seo = [
    p.area ? `Area: ${p.area}` : null,
    p.keywords?.length ? `Items/services the customer actually mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a real customer's feedback into a short Google Maps review in their own voice.

BUSINESS: ${p.businessName} (${p.businessType})
${seo}

WHAT THE CUSTOMER ACTUALLY SAID (the only source of truth):
${p.synthesizedContext}

RATING: ${p.starRating}/5
TONE: ${toneFor(p.starRating)}

TRUTH RULES (highest priority)
- Use ONLY facts from the customer's input. Never invent products, prices, staff names, or wait times.
- If the input is thin, write a shorter review. Do not pad with made-up detail.
- Never contradict the rating or any stated complaint.

STRUCTURE FOR THIS REVIEW: ${structure}
LENGTH: ${len.sentences} sentences, ${len.words} words.

VOICE
- Sound like a real person typing on a phone: plain words, mild imperfection, contractions.
- Language: ${p.language || 'English'}.
- Do not start with "I visited", "I went to", "I stopped by", or "As a customer".
- Forbidden words and phrases: exceeded expectations, nonetheless, overall, spotless, top-notch, hidden gem, must-visit.
- No titles, emojis, hashtags, bullets, quotation marks, or em dashes.

Output ONLY the review text.`;
}

// MASTER ROUTER FUNCTION: Route by category keyword regex
export function buildPrompt(p: Params): string {
  const type = p.businessType.toLowerCase().trim();

  // 1. Route to Clinic / Healthcare
  if (/clinic|doctor|hospital|dental|dentist|derma|medical|healthcare|physio|eye care|skin/i.test(type)) {
    return buildClinicPrompt(p);
  }

  // 2. Route to Cafe / Restaurant / Food
  if (/cafe|restaurant|food|bakery|diner|bistro|pizza|burger|bar|coffee|sweet|eatery/i.test(type)) {
    return buildCafeRestaurantPrompt(p);
  }

  // 3. General Fallback
  return buildGeneralPrompt(p);
}

// ============================================================================
// 3. GROQ GENERATOR & SANITIZER
// ============================================================================

async function generateWithGroq(
  prompt: string,
  apiKey: string
): Promise<string> {
  const availableModels = await getActiveGroqModels(apiKey);
  let lastError: Error | null = null;

  for (const model of availableModels) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
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
                  'You generate realistic, detailed Google Maps reviews written on a smartphone. You never output titles, headlines, emojis, corporate buzzwords, or formal phrasing. Output ONLY raw review sentences.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.85,
            top_p: 0.9,
            max_tokens: 300, // Raised to 300 tokens to ensure longer reviews complete
          }),
        }
      );

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

function fixReview(review: string): string {
  let fixed = review.trim();

  // Strip headlines/titles matching "Title at BusinessName"
  fixed = fixed.replace(/^([^.\n!?]+(?:at|@)[^.\n!?]+[\n\r:]+)/gi, '');
  fixed = fixed.replace(/^[A-Z0-9\s,–—\-]+(?:at|@)\s+[A-Z0-9\s]+(?:\n|\r|:)\s*/gi, '');

  // Remove common title/label prefixes
  fixed = fixed.replace(/^(Title|Review|Option|\d+[\.\)]|\#+)\s*:\s*/gi, '');
  fixed = fixed.replace(/^\d+\.\s*/gm, '');

  // Strip all emojis and unicode symbols
  fixed = fixed.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');

  // Strip markdown formatting, surrounding quotes, and redundant spaces
  fixed = fixed
    .replace(/^["'«“]|["'»”]$/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/^[-•]\s/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Filter out repetitive location/country descriptors
  fixed = fixed
    .replace(/,\s*a\s+local\s+Indian\s+restaurant/gi, '')
    .replace(/,\s*an\s+Indian\s+restaurant/gi, '')
    .replace(/\s+in\s+India\b/gi, '')
    .replace(/\s+Indian\s+spot\b/gi, ' spot');

  // Ensure proper sentence termination
  const lastPunct = Math.max(
    fixed.lastIndexOf('.'),
    fixed.lastIndexOf('!'),
    fixed.lastIndexOf('?')
  );

  if (lastPunct > 20 && lastPunct < fixed.length - 1) {
    fixed = fixed.substring(0, lastPunct + 1);
  }

  return fixed.trim();
}

// ============================================================================
// 4. API ROUTE HANDLER
// ============================================================================

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
      area,
      keywords,
    } = body;

    if (!businessName || !businessType || !answers || !businessId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'AI service missing configuration key' },
        { status: 500 }
      );
    }

    // Filter valid customer answers
    const validAnswers: AnswerItem[] = Array.isArray(answers)
      ? answers.filter((qa: AnswerItem) => qa.answer && qa.answer.trim().length > 0)
      : [];

    if (validAnswers.length === 0) {
      return NextResponse.json(
        { error: 'Please provide at least one answer.' },
        { status: 400 }
      );
    }

    // Rate limiting check
    const isAllowed = await checkDbRateLimit(businessId);
    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Rate limit reached for this business. Please try again later.' },
        { status: 429 }
      );
    }

    // Synthesize raw QA pairs
    const synthesizedContext = synthesizeAnswers(validAnswers);

    // Master router selects isolated prompt and calculates length/structure dynamically
    const prompt = buildPrompt({
      businessName,
      businessType,
      synthesizedContext,
      starRating,
      language,
      area,
      keywords,
    });

    const raw = await generateWithGroq(prompt, process.env.GROQ_API_KEY);
    const review = fixReview(raw);

    if (!review || review.length < 25) {
      return NextResponse.json(
        { error: 'Could not generate a valid review. Please try again.' },
        { status: 500 }
      );
    }

    // Insert session record asynchronously into Supabase
    const supabase = createSupabaseAdmin();
    const { data: session } = await supabase
      .from('review_sessions')
      .insert({
        business_id: businessId,
        language,
        answers: validAnswers,
        generated_review: review,
        star_rating: starRating,
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