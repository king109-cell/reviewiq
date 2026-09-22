import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseServer';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(businessId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(businessId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(businessId, { count: 1, resetAt: now + 3600000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

const LANGUAGE_MAP: Record<string, string> = {
  english: 'English',
  hindi: 'Hindi',
  gujarati: 'Gujarati',
  other: 'English',
};

async function callGroq(prompt: string, apiKey: string): Promise<string> {
  // Updated list of currently supported Groq models
  const models = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'llama-3.2-3b-preview',
    'mixtral-8x7b-32768',
  ];

  for (const model of models) {
    try {
      console.log('Trying model:', model);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content:
                'You write short authentic Google reviews for local businesses. You write only the review text. No explanations. No meta text. No numbering. Just the review.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.85,
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Model ${model} failed (Status ${response.status}):`, errText);
        continue;
      }

      const data = await response.json();
      const review = data.choices?.[0]?.message?.content?.trim();

      if (review && review.length > 20) {
        console.log('Success with model:', model);
        return review;
      }
    } catch (err) {
      console.error('Error with model:', model, err);
      continue;
    }
  }

  throw new Error('All models failed');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessName, businessType, businessId, language, answers, starRating } = body;

    console.log('Generate review:', { businessName, language, starRating });

    if (!businessName || !businessType || !language || !answers || !businessId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    if (!checkRateLimit(businessId)) {
      return NextResponse.json(
        { error: 'Too many reviews. Try again in an hour.' },
        { status: 429 }
      );
    }

    const answersText = answers
      .map((qa: { question: string; answer: string }) => qa.question + ': ' + qa.answer)
      .join('. ');

    const lang = LANGUAGE_MAP[language] || 'English';

    const sentiment =
      starRating <= 2
        ? 'negative and critical, mentioning what went wrong'
        : starRating === 3
        ? 'mixed and balanced'
        : 'positive and enthusiastic';

    const prompt =
      'Write a ' +
      sentiment +
      ' Google review in ' +
      lang +
      ' for ' +
      businessName +
      ' (' +
      businessType +
      '). Customer experience: ' +
      answersText +
      '. Write 3 to 5 complete sentences. First person. Casual natural tone. Do not start with I visited. No hashtags. Just the review text.';

    const review = await callGroq(prompt, process.env.GROQ_API_KEY);
    console.log('Final review:', review);

    const supabase = createSupabaseAdmin();
    const { data: session, error: dbError } = await supabase
      .from('review_sessions')
      .insert({
        business_id: businessId,
        language,
        answers,
        generated_review: review,
        star_rating: starRating,
        posted: false,
      })
      .select()
      .single();

    if (dbError) console.error('DB error:', dbError);

    return NextResponse.json({ review, sessionId: session?.id });
  } catch (err: any) {
    console.error('Final error:', err.message);
    return NextResponse.json(
      { error: 'Failed to generate review. Please try again.' },
      { status: 500 }
    );
  }
}