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
  language: string;
  area?: string;
  keywords?: string[];
};

// ============================================================================
// 1. HELPER FUNCTIONS & PROMPT CONFIGURATION
// ============================================================================

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const STRUCTURES = [
  'Open with the context or specific mentioned item, note the service/place quality strictly from facts, and finish naturally.',
  'Open with the overall takeaway based on customer feedback, mention staff or speed if provided, end with a natural verdict.',
  'Flow directly from the customer facts into a clean, phone-typed review.',
];

/**
 * Calculates review length based on the depth/volume of the customer's answers.
 */
function getLengthFromFeedback(synthesizedContext: string) {
  const wordCount = synthesizedContext.split(/\s+/).filter(Boolean).length;

  if (wordCount < 15) {
    // Thin feedback: keep it short and sweet, no artificial padding
    return { words: '20 to 35', sentences: '1 to 2' };
  } else if (wordCount <= 40) {
    // Moderate feedback: standard review length
    return { words: '35 to 55', sentences: '2 to 3' };
  } else {
    // Rich/Detailed feedback: allow full room for details
    return { words: '50 to 75', sentences: '3 to 4' };
  }
}

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
        return `[Fact ${index + 1}] Customer Note: "${a}" (Question: "${q}")`;
      } else {
        return `[Fact ${index + 1}] Selected Choice: "${a}" for "${q}"`;
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

const COMMON_TRUTH_DIRECTIVE = `
STRICT TRUTH & ZERO-HALLUCINATION RULES (HIGHEST PRIORITY):
- You MUST write the review strictly using ONLY the provided facts below.
- NEVER INVENT OR NAME dishes, menu items, drinks, services, staff names, or prices that are NOT explicitly mentioned in the customer facts.
- Match sentiment strictly to customer feedback: if customer feedback is positive, make review warm and positive; if negative or mixed, reflect exact sentiment.
- If customer input does not name a specific dish or item, write about "the food", "the order", or "the service" generally. DO NOT guess or insert random food names like "paneer pizza", "cold coffee", "garlic bread", or "pasta".
- DO NOT add fake negative points or extra complaints unless customer explicitly mentioned them.
- Match length strictly to feedback depth: do not invent extra details to make short input longer.
`;

const VOCABULARY_AND_TONE_RULES = `
VOCABULARY & EASY ENGLISH (GEN-Z / DAILY CASUAL VOICE):
- Use simple, trendy, natural daily English that real people text on their phones.
- Keep English simple and easy to read. DO NOT use big dictionary/academic words or formal English.
- FORBIDDEN HARD/FORMAL WORDS: "scrumptious", "devoured", "unwind", "exceeded expectations", "nonetheless", "overall", "ambiance", "spotless", "top-notch", "culinary", "testament", "delightful", "impeccable", "exemplary", "commendable", "pristine", "courteous", "promptness".
- Keep sentences short, simple, and clean.
`;

// PROMPT A: CAFE & RESTAURANT PROMPT
function buildCafeRestaurantPrompt(p: Params): string {
  const len = getLengthFromFeedback(p.synthesizedContext);
  const structure = pick(STRUCTURES);

  const seo = [
    p.area ? `Area: ${p.area}` : null,
    p.keywords?.length ? `Items explicitly mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a customer's real feedback into a short, natural Google review for a Cafe / Restaurant.

BUSINESS: ${p.businessName} (${p.businessType})
${seo}

CUSTOMER FACTS (YOUR ONLY SOURCE OF TRUTH):
${p.synthesizedContext}

${COMMON_TRUTH_DIRECTIVE}

${VOCABULARY_AND_TONE_RULES}

STRUCTURE: ${structure}
LENGTH: Target ${len.sentences} sentences (${len.words} words total) based on the customer's provided feedback detail.

FORMAT RULES:
- Output ONE single plain paragraph.
- NO titles, headlines, emojis, hashtags, bullets, quotes, or em dashes.
- Mention business name at most once naturally. NEVER use fake spam like "best cafe in [city]".

Output ONLY the final review paragraph.`;
}

// PROMPT B: CLINIC & HEALTHCARE PROMPT
function buildClinicPrompt(p: Params): string {
  const len = getLengthFromFeedback(p.synthesizedContext);
  const structure = pick(STRUCTURES);

  const seo = [
    p.area ? `Area: ${p.area}` : null,
    p.keywords?.length ? `Treatments explicitly mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a patient's real feedback into a short, natural Google review for a Clinic / Healthcare center.

BUSINESS: ${p.businessName} (${p.businessType})
${seo}

PATIENT FACTS (YOUR ONLY SOURCE OF TRUTH):
${p.synthesizedContext}

${COMMON_TRUTH_DIRECTIVE}

${VOCABULARY_AND_TONE_RULES}

HEALTHCARE SPECIFIC RULES:
- Focus on doctor demeanor, wait time, or hygiene ONLY if stated in the facts.
- NEVER use food words like "tasty", "delicious", or "food".

STRUCTURE: ${structure}
LENGTH: Target ${len.sentences} sentences (${len.words} words total) based on the patient's provided feedback detail.

FORMAT RULES:
- Output ONE single plain paragraph.
- NO titles, headlines, emojis, hashtags, bullets, or quotes.

Output ONLY the final review paragraph.`;
}

// PROMPT C: GENERAL BUSINESS FALLBACK PROMPT
function buildGeneralPrompt(p: Params): string {
  const len = getLengthFromFeedback(p.synthesizedContext);
  const structure = pick(STRUCTURES);

  const seo = [
    p.area ? `Area: ${p.area}` : null,
    p.keywords?.length ? `Services explicitly mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a customer's real feedback into a short, natural Google review.

BUSINESS: ${p.businessName} (${p.businessType})
${seo}

CUSTOMER FACTS (YOUR ONLY SOURCE OF TRUTH):
${p.synthesizedContext}

${COMMON_TRUTH_DIRECTIVE}

${VOCABULARY_AND_TONE_RULES}

STRUCTURE: ${structure}
LENGTH: Target ${len.sentences} sentences (${len.words} words total) based on the customer's provided feedback detail.

FORMAT RULES:
- Output ONE single plain paragraph.
- NO titles, headlines, emojis, hashtags, bullets, or quotes.

Output ONLY the final review paragraph.`;
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
                  'You generate simple, realistic Google Maps reviews written on a phone. Strictly adhere to provided facts and never invent dishes or extra details not given in the input. Use easy, natural language.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.7,
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