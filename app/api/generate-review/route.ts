import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseServer';

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
    return count < 25; // Max 25 generated reviews per hour per business
  } catch {
    return true;
  }
}

// Transform questionnaire inputs into natural spoken phrases
function synthesizeAnswers(answers: { question: string; answer: string }[]): string {
  return answers
    .map((qa) => {
      const q = qa.question.toLowerCase();
      const a = qa.answer.trim();
      const lowerA = a.toLowerCase();

      // Dish/Food ordered
      if (q.includes('order') || q.includes('dish') || q.includes('item')) {
        return `- Customer ordered: ${a}`;
      }

      // Food Quality
      if (q.includes('food') || q.includes('quality') || q.includes('taste')) {
        if (lowerA.includes('excellent') || lowerA.includes('tasty') || lowerA.includes('delicious'))
          return '- Food experience: Fresh, hot, and really delicious';
        if (lowerA.includes('good')) return '- Food experience: Tasted good and well prepared';
        if (lowerA.includes('average') || lowerA.includes('okay') || lowerA.includes('decent'))
          return '- Food experience: Average taste, nothing special';
        if (lowerA.includes('poor') || lowerA.includes('bad') || lowerA.includes('cold'))
          return '- Food experience: Poor quality and disappointing';
      }

      // Staff & Hospitality
      if (q.includes('staff') || q.includes('service') || q.includes('friendly')) {
        if (lowerA.includes('welcoming') || lowerA.includes('friendly') || lowerA.includes('great'))
          return '- Staff behavior: Super friendly and attentive';
        if (lowerA.includes('polite') || lowerA.includes('okay'))
          return '- Staff behavior: Polite and standard';
        if (lowerA.includes('unfriendly') || lowerA.includes('rude') || lowerA.includes('bad'))
          return '- Staff behavior: Inattentive and untrained';
      }

      // Cleanliness & Environment
      if (q.includes('clean') || q.includes('tidy') || q.includes('dining')) {
        if (lowerA.includes('spotless') || lowerA.includes('clean'))
          return '- Environment: Clean, tidy, and well kept';
        if (lowerA.includes('acceptable') || lowerA.includes('okay'))
          return '- Environment: Decent seating area';
        if (lowerA.includes('dirty') || lowerA.includes('untidy') || lowerA.includes('messy'))
          return '- Environment: Tables were untidy and messy';
      }

      // Service Speed
      if (q.includes('speed') || q.includes('fast') || q.includes('time')) {
        if (lowerA.includes('fast') || lowerA.includes('quick'))
          return '- Speed: Order came out very quickly';
        if (lowerA.includes('just right') || lowerA.includes('normal'))
          return '- Speed: Reasonable wait time';
        if (lowerA.includes('slow') || lowerA.includes('long'))
          return '- Speed: Service took way too long';
      }

      // Recommendation / Intent
      if (q.includes('recommend') || q.includes('likely') || q.includes('friend')) {
        if (lowerA.includes('very likely') || lowerA.includes('definitely'))
          return '- Intent: Will definitely return and recommend to friends';
        if (lowerA.includes('maybe')) return '- Intent: Might check it out again sometime';
        if (lowerA.includes('unlikely') || lowerA.includes('no'))
          return '- Intent: Won\'t be coming back anytime soon';
      }

      return `- ${qa.question}: ${a}`;
    })
    .join('\n');
}

// Dynamically fetch available models directly from Groq API
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

function buildPrompt(
  businessName: string,
  businessType: string,
  synthesizedContext: string,
  starRating: number,
  language: string
): string {
  // Opening sentence anchor variations
  const starterStyles = [
    `Start directly by mentioning what was eaten or ordered at ${businessName}.`,
    `Start directly with a note on the staff or service speed.`,
    `Start directly with an observation about the seating area or cleanliness.`,
    `Start directly with a quick comment about the food quality.`,
  ];
  const selectedStyle = starterStyles[Math.floor(Math.random() * starterStyles.length)];

  // Tone adjustments matching star ratings
  let toneGuidance = 'Write a casual, balanced review.';
  if (starRating >= 4) {
    toneGuidance = 'Tone: Satisfied and warm casual recommendation.';
  } else if (starRating <= 2) {
    toneGuidance = 'Tone: Frustrated, direct, and blunt. Speak directly about what went wrong.';
  } else {
    toneGuidance = 'Tone: Honest and mixed experience.';
  }

  return `You are a real customer leaving a quick, authentic Google Maps review for "${businessName}" (${businessType}).

CUSTOMER VISIT CONTEXT:
${synthesizedContext}

${toneGuidance}

OPENING STYLE FOR THIS REVIEW:
${selectedStyle}

STRICT WRITING RULES:
1. NO HEADLINES OR TITLES:
   - NEVER write titles (e.g., DO NOT write "Delicious Food at...", "Average Visit...", "Poor Service...").
   - Start immediately with sentence #1.

2. AUTHENTIC SMARTPHONE VOICE:
   - Write as if typing on a smartphone screen.
   - NO EMOJIS, NO HASHTAGS, NO BULLET POINTS, NO QUOTATION MARKS.
   - FORBIDDEN WORDS: "purchased for a casual bite", "lacked friendliness", "considering the service", "disappointing experience", "scrumptious", "devoured", "unwind", "exceeded expectations", "nonetheless", "overall", "ambiance", "spotless", "decent choice", "room for improvement", "top-notch".
   - DO NOT start with "I visited", "I went to", "I stopped by", or "As a customer".

3. LENGTH & LANGUAGE:
   - Exactly 2 to 3 concise sentences (30 to 50 words total).
   - Language: ${language || 'English'}.

Output ONLY the raw review paragraph text.`;
}

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
                  'You generate ultra-realistic, simple Google Maps reviews written on a phone. You never output headlines, titles, emojis, corporate buzzwords, or formal phrasing. Output ONLY raw review sentences.',
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

function fixReview(review: string): string {
  let fixed = review.trim();

  // 1. Strip headlines/titles matching "Title at BusinessName" or "Adjective Noun at..."
  fixed = fixed.replace(/^([^.\n!?]+(?:at|@)[^.\n!?]+[\n\r:]+)/gi, '');
  fixed = fixed.replace(/^[A-Z0-9\s,–—\-]+(?:at|@)\s+[A-Z0-9\s]+(?:\n|\r|:)\s*/gi, '');

  // 2. Remove common title/label prefixes (e.g., "Title:", "Review:", "1.")
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
    const validAnswers = Array.isArray(answers)
      ? answers.filter((qa: any) => qa.answer && qa.answer.trim().length > 0)
      : [];

    if (validAnswers.length === 0) {
      return NextResponse.json(
        { error: 'Please provide at least one answer.' },
        { status: 400 }
      );
    }

    // Serverless-safe rate limiting
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

    // Insert into Supabase async (handles session persistence)
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