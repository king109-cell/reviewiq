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

// Dynamic opening variations to prevent repetitive "went to..." starters
const OPENING_STYLES = [
  'Direct item focus (e.g., jump straight into talking about the specific item, service, or feature mentioned).',
  'Overall experience focus (e.g., state a general feeling about the place before talking about details).',
  'Service or staff first (e.g., mention how smooth, quick, or helpful everything was right away).',
  'Casual recommendation style (e.g., start with a natural reaction to the visit).',
  'Context-first style (e.g., mention stopping by or ordering without using repetitive phrases).',
  'Direct compliment/verdict style (e.g., lead with a positive or neutral observation straight away).',
];

const STRUCTURES = [
  'Lead with the specific item/service mentioned, follow up with staff/speed quality, finish with a quick natural verdict.',
  'Lead with an overall honest impression, dive into the actual details provided, end with a casual conclusion.',
  'Jump straight into what stood out from the facts, then mention the customer experience naturally.',
  'Keep it ultra-direct: short reaction first, specific customer detail second, final casual thought at the end.',
];

/**
 * Calculates review length based on the depth/volume of the customer's answers.
 */
function getLengthFromFeedback(synthesizedContext: string) {
  const wordCount = synthesizedContext.split(/\s+/).filter(Boolean).length;

  if (wordCount < 15) {
    return { words: '20 to 35', sentences: '1 to 2' };
  } else if (wordCount <= 40) {
    return { words: '35 to 55', sentences: '2 to 3' };
  } else {
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

/**
 * Transforms customer Q&A into contextual facts so the AI paraphrases 
 * selected options into natural text rather than copying option strings verbatim.
 */
function synthesizeAnswers(answers: AnswerItem[]): string {
  return answers
    .map((item, index) => {
      const q = item.question.trim();
      const a = item.answer.trim();

      if (!a) return null;

      const isTextAnswer = item.type === 'text' || a.length > 25 || a.includes(' ');

      if (isTextAnswer) {
        return `[Fact ${index + 1}] Customer Written Note: "${a}" (Topic: "${q}")`;
      } else {
        return `[Fact ${index + 1}] Selected Choice/Feedback: "${a}" for aspect "${q}"`;
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
- Match sentiment strictly to customer feedback: if positive, keep it warm and happy; if mixed/negative, reflect exact notes.
- If customer input does not name a specific dish or item, write about "the food", "the order", or "the service" generally. DO NOT guess food names.
- DO NOT add fake negative points or extra complaints unless explicitly mentioned.
`;

const OPTION_PARAPHRASING_RULES = `
NATURAL PARAPHRASING (DO NOT COPY OPTION TEXT EXACTLY):
- DO NOT copy option choices verbatim! Convert selected options into natural, casual sentences.
  * Example: If selected choice is "Clean and tidy", write "the place was super clean" or "really neat setup".
  * Example: If selected choice is "Fast service", write "got our order really quickly" or "service was super fast".
  * Example: If selected choice is "Friendly staff", write "staff members were really nice to us".
- Never sound like a robot reading a multiple-choice menu. Make it flow like a real phone text.
`;

const DIVERSITY_AND_OPENING_RULES = `
OPENING VARIATION & NATURAL TEXTING VOICE:
- FORBIDDEN OPENINGS: NEVER start sentences with "Went to...", "I went to...", "Visited...", "Had a visit to...", "I visited...". Vary the beginning completely!
- Make every review feel unique and freshly typed from a phone by an actual customer.
- Use simple, casual everyday English.
- FORBIDDEN HARD/FORMAL WORDS: "scrumptious", "devoured", "unwind", "exceeded expectations", "nonetheless", "overall", "ambiance", "spotless", "top-notch", "culinary", "testament", "delightful", "impeccable", "exemplary", "commendable", "pristine", "courteous", "promptness".
`;

// PROMPT A: CAFE & RESTAURANT PROMPT
function buildCafeRestaurantPrompt(p: Params): string {
  const len = getLengthFromFeedback(p.synthesizedContext);
  const structure = pick(STRUCTURES);
  const openingStyle = pick(OPENING_STYLES);

  const seo = [
    p.area ? `Area: ${p.area}` : null,
    p.keywords?.length ? `Items explicitly mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a customer's real feedback into a unique, realistic Google review for a Cafe / Restaurant.

BUSINESS: ${p.businessName} (${p.businessType})
${seo}

CUSTOMER FACTS (YOUR ONLY SOURCE OF TRUTH):
${p.synthesizedContext}

${COMMON_TRUTH_DIRECTIVE}

${OPTION_PARAPHRASING_RULES}

${DIVERSITY_AND_OPENING_RULES}

OPENING STYLE FOR THIS REVIEW: ${openingStyle}
STRUCTURE: ${structure}
LENGTH: Target ${len.sentences} sentences (${len.words} words total).

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
  const openingStyle = pick(OPENING_STYLES);

  const seo = [
    p.area ? `Area: ${p.area}` : null,
    p.keywords?.length ? `Treatments explicitly mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a patient's real feedback into a unique, realistic Google review for a Clinic / Healthcare center.

BUSINESS: ${p.businessName} (${p.businessType})
${seo}

PATIENT FACTS (YOUR ONLY SOURCE OF TRUTH):
${p.synthesizedContext}

${COMMON_TRUTH_DIRECTIVE}

${OPTION_PARAPHRASING_RULES}

${DIVERSITY_AND_OPENING_RULES}

HEALTHCARE SPECIFIC RULES:
- Focus on doctor demeanor, wait time, or hygiene ONLY if stated in the facts.
- NEVER use food words like "tasty", "delicious", or "food".

OPENING STYLE FOR THIS REVIEW: ${openingStyle}
STRUCTURE: ${structure}
LENGTH: Target ${len.sentences} sentences (${len.words} words total).

FORMAT RULES:
- Output ONE single plain paragraph.
- NO titles, headlines, emojis, hashtags, bullets, or quotes.

Output ONLY the final review paragraph.`;
}

// PROMPT C: GENERAL BUSINESS FALLBACK PROMPT
function buildGeneralPrompt(p: Params): string {
  const len = getLengthFromFeedback(p.synthesizedContext);
  const structure = pick(STRUCTURES);
  const openingStyle = pick(OPENING_STYLES);

  const seo = [
    p.area ? `Area: ${p.area}` : null,
    p.keywords?.length ? `Services explicitly mentioned: ${p.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `You are turning a customer's real feedback into a unique, realistic Google review.

BUSINESS: ${p.businessName} (${p.businessType})
${seo}

CUSTOMER FACTS (YOUR ONLY SOURCE OF TRUTH):
${p.synthesizedContext}

${COMMON_TRUTH_DIRECTIVE}

${OPTION_PARAPHRASING_RULES}

${DIVERSITY_AND_OPENING_RULES}

OPENING STYLE FOR THIS REVIEW: ${openingStyle}
STRUCTURE: ${structure}
LENGTH: Target ${len.sentences} sentences (${len.words} words total).

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
                  'You generate simple, realistic Google Maps reviews written on a phone. Paraphrase option selections into natural human phrases instead of repeating exact option text. Strictly adhere to facts.',
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

  // Strip common repetitive opening starters if LLM accidentally outputs them
  fixed = fixed.replace(/^(I went to|Went to|I visited|Visited|Had a visit to)\s+/gi, '');
  // Capitalize the new first character if stripped
  fixed = fixed.charAt(0).toUpperCase() + fixed.slice(1);

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