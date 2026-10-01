import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseServer';

type AnswerItem = {
  question: string;
  answer: string;
  type?: 'mcq' | 'text' | string;
};

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
    return count < 60; // Max 25 generated reviews per hour per business
  } catch {
    return true;
  }
}

// 1. CONTEXT SYNTHESIZER: Translates up to 5 custom MCQs / Free-Text fields into natural context facts
function synthesizeAnswers(answers: AnswerItem[]): string {
  return answers
    .map((item, index) => {
      const q = item.question.trim();
      const a = item.answer.trim();

      if (!a) return null;

      // Identify if response is custom text or MCQ choice
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

// 2. PROMPT BUILDER: Enforces 3-Step Narrative Structure (Anchor -> Experience -> Closing)
function buildPrompt(
  businessName: string,
  businessType: string,
  synthesizedContext: string,
  starRating: number,
  language: string
): string {
  // Match tone strictly to star ratings
  let toneGuidance = 'Tone: Casual, genuine, and balanced.';
  if (starRating >= 4) {
    toneGuidance = 'Tone: Satisfied, positive, and enthusiastic casual recommendation.';
  } else if (starRating <= 2) {
    toneGuidance = 'Tone: Direct, honest, and critical. Speak bluntly about what went wrong.';
  } else {
    toneGuidance = 'Tone: Honest and mixed experience, noting both good and weak points.';
  }

  return `You are a real customer writing a quick, authentic Google Maps review on a mobile phone for "${businessName}" (${businessType}).

CUSTOMER VISIT FACTS:
${synthesizedContext}

${toneGuidance}

MANDATORY 3-STEP NARRATIVE STRUCTURE:
You MUST follow this exact narrative order to write the review:
- STEP 1 (THE ANCHOR): Start immediately with the main dish, item ordered, or primary specific note provided by the customer. Make this sentence concrete with specific details.
- STEP 2 (THE EXPERIENCE): Mention the staff speed, service quality, or cleanliness in 1 concise sentence.
- STEP 3 (THE CLOSING SENTIMENT): End with a natural recommendation or concluding thought (e.g., "Will definitely come back", "Worth stopping by", or "Needs improvement").

STRICT RULES & CONSTRAINTS:
1. FAITHFUL DATA BLENDING:
   - Blend all provided facts across the 3 steps smoothly.
   - NEVER quote question names or labels verbatim (e.g., NEVER write 'Question 1:' or 'Regarding Food: Good'). Translate facts into natural spoken language.
   - Give high priority to any custom text notes or specific items mentioned by the user.

2. ZERO TITLES & STRICT FORMATTING:
   - NO HEADLINES OR TITLES: Do NOT start with titles (e.g., NO "Great Food!", "Honest Review:").
   - NO EMOJIS, NO HASHTAGS, NO BULLET POINTS, NO QUOTATION MARKS.
   - Start directly with Sentence #1.

3. HUMAN SMARTPHONE VOICE:
   - Write like a real person typing quickly on a phone keyboard.
   - FORBIDDEN FORMAL/CLICHÉ PHRASES: "purchased for a casual bite", "lacked friendliness", "disappointing experience", "scrumptious", "devoured", "unwind", "exceeded expectations", "nonetheless", "overall", "ambiance", "spotless", "decent choice", "top-notch".
   - DO NOT start with "I visited", "I went to", "I stopped by", or "As a customer".

4. LENGTH & LANGUAGE:
   - Exactly 4 to 7 natural sentences total (40 to 70 words max).
   - Language: ${language || 'English'}.

Output ONLY the raw final review paragraph text.`;
}

// 3. GROQ AI GENERATOR: Uses temperature 0.85 & top_p 0.9 for creative, natural phrasing
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
                  'You generate ultra-realistic, simple Google Maps reviews written on a smartphone. You never output titles, headlines, emojis, corporate buzzwords, or formal phrasing. Output ONLY raw review sentences.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.85,
            top_p: 0.9,
            max_tokens: 160,
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

// 4. SANITIZER: Cleans headers, quotes, emojis, and lingering artifacts
function fixReview(review: string): string {
  let fixed = review.trim();

  // 1. Strip headlines/titles matching "Title at BusinessName" or "Adjective Noun at..."
  fixed = fixed.replace(/^([^.\n!?]+(?:at|@)[^.\n!?]+[\n\r:]+)/gi, '');
  fixed = fixed.replace(/^[A-Z0-9\s,–—\-]+(?:at|@)\s+[A-Z0-9\s]+(?:\n|\r|:)\s*/gi, '');

  // 2. Remove common title/label prefixes (e.g. "Title:", "Review:", "1.")
  fixed = fixed.replace(/^(Title|Review|Option|\d+[\.\)]|\#+)\s*:\s*/gi, '');
  fixed = fixed.replace(/^\d+\.\s*/gm, '');

  // 3. Strip all emojis and non-standard unicode symbols
  fixed = fixed.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');

  // 4. Strip markdown formatting, surrounding quotes, and redundant spaces
  fixed = fixed
    .replace(/^["'«“]|["'»”]$/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/^[-•]\s/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 5. Filter out repetitive location/country descriptors
  fixed = fixed
    .replace(/,\s*a\s+local\s+Indian\s+restaurant/gi, '')
    .replace(/,\s*an\s+Indian\s+restaurant/gi, '')
    .replace(/\s+in\s+India\b/gi, '')
    .replace(/\s+Indian\s+spot\b/gi, ' spot');

  // 6. Ensure proper sentence termination
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

    // Serverless-safe rate limiting using DB count
    const isAllowed = await checkDbRateLimit(businessId);
    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Rate limit reached for this business. Please try again later.' },
        { status: 429 }
      );
    }

    // Synthesize raw QA pairs into rich conversational context
    const synthesizedContext = synthesizeAnswers(validAnswers);

    const prompt = buildPrompt(
      businessName,
      businessType,
      synthesizedContext,
      starRating,
      language
    );

    const raw = await generateWithGroq(prompt, process.env.GROQ_API_KEY);
    const review = fixReview(raw);

    if (!review || review.length < 25) {
      return NextResponse.json(
        { error: 'Could not generate a valid review. Please try again.' },
        { status: 500 }
      );
    }

    // Insert session into Supabase async
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