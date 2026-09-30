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

// Officially supported Groq models for production & free tier usage
const GROQ_MODELS = [
  'llama-3.3-70b-versatile', // Primary: Highly capable, high quality, active on free tier
  'llama-3.1-8b-instant'     // Fast fallback
];

function buildPrompt(
  businessName: string,
  businessType: string,
  answersText: string,
  starRating: number,
  language: string
): string {
  const sentiment =
    starRating <= 2
      ? 'honest and constructive, bringing up specific problems experienced'
      : starRating === 3
      ? 'fair and balanced, sharing both pros and areas for growth'
      : 'enthusiastic, warm, and highly satisfied';

  return `You are a real customer writing an authentic, human-sounding Google review for ${businessName}, a local ${businessType} in India.

Customer Experience Answers:
${answersText}

STRICT WRITING RULES:
1. Language: Write the ENTIRE review in ${language || 'English'}.
2. Tone & SEO: Write a ${sentiment} review using simple, everyday natural language. Organically mention key terms related to ${businessType} and ${businessName} to enhance local search visibility without keyword-stuffing.
3. Authenticity: Avoid AI cliché buzzwords (NEVER use words like "exceptional", "unmatched", "testament", "seamless", "strive", "top-notch", "impeccable", "delighted").
4. Specifics: Incorporate 2 to 3 specific details from the customer experience provided above. Do not invent details not mentioned.
5. Length & Flow: Keep it concise (2 to 4 sentences, ~35 to 80 words). Do NOT begin with "I visited", "I went to", or "As a customer".
6. Formatting: No emojis, no hashtags, no quotation marks around the review, and no markdown.
7. Output: Return ONLY the final raw review text.

Write the review text now:`;
}

async function generateWithGroq(
  prompt: string,
  apiKey: string
): Promise<string> {
  let lastError: Error | null = null;

  for (const model of GROQ_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s timeout per attempt

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
                  'You write realistic, natural, human-written Google reviews for local businesses in India. You follow all style and length instructions strictly and return only the raw review output.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.7,
            max_tokens: 250,
          }),
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.json();
        lastError = new Error(err.error?.message || `Groq model ${model} failed with status ${response.status}`);
        continue;
      }

      const data = await response.json();
      const review = data.choices?.[0]?.message?.content?.trim();

      if (review && review.length >= 25) {
        return review;
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error('All AI models failed to generate response.');
}

function fixReview(review: string): string {
  let fixed = review.trim();

  fixed = fixed
    .replace(/^["']|["']$/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/^\d+\.\s/gm, '')
    .replace(/^[-•]\s/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (fixed.toLowerCase().startsWith('i visited')) {
    const spaceIndex = fixed.indexOf(' ', 10);
    if (spaceIndex !== -1) {
      fixed = fixed.substring(spaceIndex).trim();
      fixed = fixed.charAt(0).toUpperCase() + fixed.slice(1);
    }
  }

  const lastPunct = Math.max(
    fixed.lastIndexOf('.'),
    fixed.lastIndexOf('!'),
    fixed.lastIndexOf('?')
  );

  if (lastPunct > 25 && lastPunct < fixed.length - 1) {
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

    const answersText = validAnswers
      .map((qa: { question: string; answer: string }) => `- ${qa.question}: ${qa.answer}`)
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