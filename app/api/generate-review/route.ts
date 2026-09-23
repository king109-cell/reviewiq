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

// Helper function to fetch active Groq model IDs dynamically
async function getAvailableGroqModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      const models = data.data
        ?.map((m: any) => m.id)
        ?.filter((id: string) => !id.includes('whisper') && !id.includes('guard')); // Exclude audio and guardrail models

      if (models && models.length > 0) {
        console.log('Fetched active Groq models:', models);
        return models;
      }
    }
  } catch (err) {
    console.error('Failed to fetch dynamic model list from Groq:', err);
  }

  // Fallback defaults if listing API fails
  return [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'openai/gpt-oss-20b',
    'meta-llama/llama-3.3-70b-instruct'
  ];
}

async function callGroq(prompt: string, apiKey: string): Promise<string> {
  const models = await getAvailableGroqModels(apiKey);

  for (const model of models) {
    try {
      console.log('Trying model:', model);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
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
          max_completion_tokens: 200,
        }),
      });

      const rawText = await response.text();

      if (!response.ok) {
        console.error(`[Groq Error] Model: ${model} | Status: ${response.status} | Response: ${rawText}`);
        
        if (response.status === 401) {
          throw new Error('Invalid Groq API Key (HTTP 401)');
        }
        continue;
      }

      const data = JSON.parse(rawText);
      const review = data.choices?.[0]?.message?.content?.trim();

      if (review && review.length > 15) {
        console.log('Success with model:', model);
        return review;
      }
    } catch (err: any) {
      if (err.message.includes('Invalid Groq API Key')) throw err;
      console.error(`[Model Failed] ${model}:`, err);
      continue;
    }
  }

  throw new Error('All Groq models failed. Check console output above for precise API errors.');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessName, businessType, businessId, language, answers, starRating } = body;

    console.log('Generate review payload:', { businessName, language, starRating });

    if (!businessName || !businessType || !language || !answers || !businessId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error('GROQ_API_KEY environment variable is missing.');
      return NextResponse.json({ error: 'AI key not configured' }, { status: 500 });
    }

    if (!checkRateLimit(businessId)) {
      return NextResponse.json(
        { error: 'Too many reviews. Try again in an hour.' },
        { status: 429 }
      );
    }

    const answersText = Array.isArray(answers)
      ? answers.map((qa: { question: string; answer: string }) => qa.question + ': ' + qa.answer).join('. ')
      : '';

    const lang = LANGUAGE_MAP[language] || 'English';

    const sentiment =
      starRating <= 2
        ? 'negative and critical, mentioning what went wrong'
        : starRating === 3
        ? 'mixed and balanced'
        : 'positive and enthusiastic';

    const prompt = `Write a ${sentiment} Google review in ${lang} for ${businessName} (${businessType}). Customer experience: ${answersText}. Write 3 to 5 complete sentences. First person. Casual natural tone. Do not start with "I visited" or use words like "yo". No hashtags. Just the review text.`;

    const review = await callGroq(prompt, apiKey);
    console.log('Generated Review Output:', review);

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

    if (dbError) {
      console.error('Supabase DB error:', dbError);
    }

    return NextResponse.json({ review, sessionId: session?.id });
  } catch (err: any) {
    console.error('Final Route Error:', err.message);
    return NextResponse.json(
      { error: err.message || 'Failed to generate review. Please try again.' },
      { status: 500 }
    );
  }
}