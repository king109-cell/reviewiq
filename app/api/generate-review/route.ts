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

// Convert questionnaire choice values into natural conversational observations
function formatAnswerNaturally(question: string, answer: string): string {
  const cleanAns = answer.trim();
  const lowerAns = cleanAns.toLowerCase();

  // Convert raw survey dropdowns into conversational human phrases
  if (lowerAns === 'good' || lowerAns === 'very good') return 'food was hot and fresh';
  if (lowerAns === 'acceptable' || lowerAns === 'okay') return 'decent and clean seating area';
  if (lowerAns === 'just right') return 'place was well kept';
  if (lowerAns === 'slow') return 'service took a bit longer than expected';
  if (lowerAns === 'fast' || lowerAns === 'very fast') return 'food came out quickly';
  if (lowerAns === 'unlikely') return 'mixed on going back anytime soon';

  return cleanAns;
}

// Fetch active models directly from Groq API
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
  answersText: string,
  starRating: number,
  language: string
): string {
  return `Write a realistic, human-written Google Maps review for "${businessName}" (${businessType}).

Customer Experience Notes:
${answersText}

CRITICAL RULES (VIOLATIONS WILL CAUSE SYSTEM FAILURE):
1. NO HEADLINES OR TITLES: Do NOT start with any title (e.g. NEVER write "Delicious Pizza at...", "Great Food at...", "Average Food...", "Welcoming Staff..."). Start directly with the first sentence of the review.
2. NO AI BUZZWORDS & DRAMATIC PHRASES:
   - FORBIDDEN WORDS: "scrumptious", "top-notch", "devoured", "array of choices", "cuisine department", "unwind", "exceeded expectations", "nonetheless", "overall", "ambiance", "spotless", "decent choice", "room for improvement".
3. NO EMOJIS, HASHTAGS, OR QUOTES: Do NOT include emojis (like 😍, 👍, 🍕), bullet points, markdown formatting, or surrounding quotation marks.
4. REAL LOCAL PERSON VOICE:
   - Write like a normal person writing a 2-3 sentence review on their phone on Google Maps.
   - Speak about the actual food item, cleanliness, or waiting time naturally.
   - Do NOT say "a local Indian restaurant" or mention country names.
5. LENGTH: 2 to 4 sentences maximum (35 to 55 words total).
6. LANGUAGE: Entire review must be in ${language || 'English'}.

Output ONLY the raw review sentence paragraph. Nothing else.`;
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
                  'You write ultra-realistic, simple Google Maps reviews. You never write titles, headlines, emojis, or exaggerated marketing adjectives. You output ONLY 2-3 simple raw sentences.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.75,
            max_tokens: 150,
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

  // 1. Strip away headlines/titles matching "Words at BusinessName" or "Adjective Noun at..."
  fixed = fixed.replace(/^([^.\n!?]+(?:at|@)[^.\n!?]+[\n\r:]+)/gi, '');
  fixed = fixed.replace(/^[A-Z0-9\s,–—\-]+(?:at|@)\s+[A-Z0-9\s]+(?:\n|\r|:)\s*/gi, '');

  // 2. Remove common title prefixes (e.g. "Title:", "Review:", "1.")
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

  // 5. Filter out nationality / country mentions if present
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

    // Process customer choices into natural human phrasing
    const answersText = validAnswers
      .map(
        (qa: { question: string; answer: string }) =>
          `- ${qa.question}: ${formatAnswerNaturally(qa.question, qa.answer)}`
      )
      .join('\n');

    const prompt = buildPrompt(
      businessName,
      businessType,
      answersText,
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