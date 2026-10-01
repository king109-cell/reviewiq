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
  'Open with context (when or who went), mention a specific item with a sensory detail, note a service/place aspect, end naturally.',
  'Open with the specific item/moment and a sensory detail, mention staff behavior or wait time, finish with return intent.',
  'Open with the strongest opinion about the service or place, back it up with a specific item detail, end with a grounded verdict.',
  'Write a flowing sentence linking context and specific item details, followed by a short line about service and a natural close.',
];

// Target lengths: 35 to 60 words for low ratings (1-2 stars), 40 to 75 words for higher ratings (3-5 stars)
function r_len(rating: number) {
  if (rating <= 2) {
    return { words: '35 to 60', sentences: '2 to 3' };
  }
  
  const higherRatingPool = [
    { words: '40 to 60', sentences: '2 to 3' },
    { words: '50 to 75', sentences: '3 to 4' },
    { words: '45 to 70', sentences: '3 to 4' },
  ];
  return pick(higherRatingPool);
}

function toneFor(r: number): string {
  if (r === 5) return 'Warm and specific, not gushing or over-enthusiastic.';
  if (r === 4) return 'Positive with one small honest caveat to keep it believable.';
  if (r === 3) return 'Balanced and fair: name one good point and one weak point.';
  return 'Factual, calm, and direct. Describe exactly what happened with no accusations, exaggeration, or insults.';
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

    if (error || count === null) return true;
    return count < 60;
  } catch {
    return true;
  }
}

function synthesizeAnswers(answers: AnswerItem[]): string {
  return answers
    .map((item, index) => {
      const q = item.question.trim();
      const a = item.answer.trim();

      if (!a) return null;

      const isTextAnswer = item.type === 'text' || a.length > 25 || a.includes(' ');

      if (isTextAnswer) {
        return `[Fact ${index + 1}] Regarding "${q}": The customer noted: "${a}"`;
      } else {
        return `[Fact ${index + 1}] Question: "${q}" -> Selected Choice: "${a}"`;
      }
    })
    .filter(Boolean)
    .join('\n');
}

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

    return models.sort((a, b) => {
      const idxA = priorityOrder.indexOf(a);
      const idxB = priorityOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
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
    p.area ? `Area/Neighborhood: ${p.area}` : null,
    p.keywords?.length ? `Dishes/items actually mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a real customer's feedback into a short Google Maps review in their own voice.

BUSINESS: ${p.businessName} (${p.businessType})
${seo}

WHAT THE CUSTOMER ACTUALLY SAID (the only source of truth):
${p.synthesizedContext}

RATING: ${p.starRating}/5
TONE: ${toneFor(p.starRating)}

TRUTH RULES (highest priority)
- Use ONLY facts from the customer's input. Never invent dishes, prices, staff names, wait times, occasions, or companions.
- If the input is thin, keep it brief and natural. Do not pad with made-up detail.
- Never contradict the rating or any stated complaint.

KEY ELEMENTS TO INCLUDE (Prioritize in order if facts exist in customer input):
1. Specific Item/Moment: e.g. "butter garlic naan" rather than "the food".
2. Sensory or Concrete Detail: e.g. piping hot, long wait, crisp, table by the window.
3. Service or Place Detail: wait time, staff behavior, parking, hygiene.
4. Context: when or who they went with (e.g. Sunday dinner, after work, with family).
5. Natural Close: return intent or grounded conclusion in the customer's voice.

STRUCTURE: ${structure}
LENGTH: Exactly ${len.sentences} sentences (${len.words} words total).

SEO & FORMAT RULES:
- Format: Exactly ONE plain paragraph.
- NO titles, headlines, emojis, hashtags, bullets, quotation marks, or em dashes.
- Safe SEO: Mention the business name at most once (only if natural). Include specific dishes or the area naturally.
- FORBIDDEN SEO PATTERNS: Never use phrases like "best cafe in [city]", keyword lists, or repetitive city-plus-keyword strings.

VOICE:
- Sound like a real person typing on a phone: plain words, mild imperfection, contractions.
- Language: ${p.language || 'English'}. If Hindi or Gujarati, match local texting style (Latin script or mixed).
- Do NOT start with "I visited", "I went to", "I stopped by", or "As a customer".
- FORBIDDEN WORDS: scrumptious, devoured, unwind, exceeded expectations, nonetheless, overall, ambiance, spotless, top-notch, decent choice, hidden gem, must-visit, culinary journey, elevated, delightful, "a testament to".

Output ONLY the raw review paragraph.`;
}

// PROMPT B: CLINIC & HEALTHCARE PROMPT
function buildClinicPrompt(p: Params): string {
  const len = r_len(p.starRating);
  const structure = pick(STRUCTURES);

  const seo = [
    p.area ? `Area/Neighborhood: ${p.area}` : null,
    p.keywords?.length ? `Services/treatments actually mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a real patient's feedback into a short Google Maps review in their own voice.

BUSINESS: ${p.businessName} (${p.businessType})
${seo}

WHAT THE PATIENT ACTUALLY SAID (the only source of truth):
${p.synthesizedContext}

RATING: ${p.starRating}/5
TONE: ${toneFor(p.starRating)}

TRUTH RULES (highest priority)
- Use ONLY facts from the patient's input. Never invent treatments, doctor names, diagnoses, prices, or wait times.
- If the input is thin, keep it brief and natural. Do not pad with made-up detail.
- Never contradict the rating or any stated complaint.

KEY ELEMENTS TO INCLUDE (Prioritize in order if facts exist in input):
1. Specific Treatment/Service: exact procedure or consultation mentioned.
2. Concrete Detail: doctor's demeanor, explanation clarity, queue management, hygiene.
3. Context: who went or when (e.g. routine checkup, appointment last week).
4. Natural Close: patient trust variant like "felt in good hands" or "glad to have found a good clinic".

STRUCTURE: ${structure}
LENGTH: Exactly ${len.sentences} sentences (${len.words} words total).

SEO & FORMAT RULES:
- Format: Exactly ONE plain paragraph.
- NO titles, headlines, emojis, hashtags, bullets, quotation marks, or em dashes.
- Safe SEO: Mention business name at most once. Mention area naturally if applicable.
- FORBIDDEN: Never use dining terms ("delicious", "scrumptious", "taste") or casual dining closes ("can't wait to visit again").

VOICE:
- Sound like a real patient typing on a phone: plain words, mild imperfection, contractions.
- Language: ${p.language || 'English'}. If Hindi or Gujarati, match local texting style.
- Do NOT start with "I visited", "I went to", "I stopped by", or "As a patient".
- FORBIDDEN WORDS: exceeded expectations, nonetheless, overall, spotless, top-notch, hidden gem, "a testament to", "highly recommend".

Output ONLY the raw review paragraph.`;
}

// PROMPT C: GENERAL BUSINESS FALLBACK PROMPT
function buildGeneralPrompt(p: Params): string {
  const len = r_len(p.starRating);
  const structure = pick(STRUCTURES);

  const seo = [
    p.area ? `Area/Neighborhood: ${p.area}` : null,
    p.keywords?.length ? `Items/services actually mentioned: ${p.keywords.join(', ')}` : null,
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
- If the input is thin, keep it brief and natural. Do not pad with made-up detail.
- Never contradict the rating or any stated complaint.

KEY ELEMENTS TO INCLUDE (Prioritize in order if facts exist in input):
1. Specific Item or Service mentioned.
2. Concrete Detail: quality, staff response, speed, or facility detail.
3. Context: occasion or timing.
4. Natural Close: grounded recommendation or return intent.

STRUCTURE: ${structure}
LENGTH: Exactly ${len.sentences} sentences (${len.words} words total).

SEO & FORMAT RULES:
- Format: Exactly ONE plain paragraph.
- NO titles, headlines, emojis, hashtags, bullets, quotation marks, or em dashes.
- Safe SEO: Mention business name at most once. No keyword lists or "best [business] in [city]" patterns.

VOICE:
- Sound like a real person typing on a phone: plain words, mild imperfection, contractions.
- Language: ${p.language || 'English'}.
- Do NOT start with "I visited", "I went to", "I stopped by", or "As a customer".
- FORBIDDEN WORDS: exceeded expectations, nonetheless, overall, spotless, top-notch, hidden gem, must-visit.

Output ONLY the raw review paragraph.`;
}

// MASTER ROUTER FUNCTION
export function buildPrompt(p: Params): string {
  const type = p.businessType.toLowerCase().trim();

  if (/clinic|doctor|hospital|dental|dentist|derma|medical|healthcare|physio|eye care|skin/i.test(type)) {
    return buildClinicPrompt(p);
  }

  if (/cafe|restaurant|food|bakery|diner|bistro|pizza|burger|bar|coffee|sweet|eatery/i.test(type)) {
    return buildCafeRestaurantPrompt(p);
  }

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
                  'You generate realistic Google Maps reviews written on a smartphone. Output ONLY raw review sentences in a single plain paragraph. No titles, emojis, quotation marks, or formatting.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.85,
            top_p: 0.9,
            max_tokens: 300,
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
    .replace(/\s+in\s+India\b/gi, '');

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

    const validAnswers: AnswerItem[] = Array.isArray(answers)
      ? answers.filter((qa: AnswerItem) => qa.answer && qa.answer.trim().length > 0)
      : [];

    if (validAnswers.length === 0) {
      return NextResponse.json(
        { error: 'Please provide at least one answer.' },
        { status: 400 }
      );
    }

    const isAllowed = await checkDbRateLimit(businessId);
    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Rate limit reached for this business. Please try again later.' },
        { status: 429 }
      );
    }

    const synthesizedContext = synthesizeAnswers(validAnswers);

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