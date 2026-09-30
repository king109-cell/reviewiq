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

function buildPrompt(
  businessName: string,
  businessType: string,
  answersText: string,
  starRating: number
): string {
  const sentiment =
    starRating <= 2
      ? 'honest and critical, mentioning specific problems'
      : starRating === 3
      ? 'balanced, mentioning both positives and areas to improve'
      : 'warm, genuine and appreciative';

  return `You are a real customer writing a Google review. Write a ${sentiment} review for ${businessName}, a ${businessType} in India.

Customer experience details:
${answersText}

Writing rules you must follow strictly:
- Write between 60 to 90 words exactly
- Use natural first person language like a real educated Indian customer
- Sound genuine and specific, not generic or promotional
- Do NOT start with "I visited" or "I went to"
- Include 2 to 3 specific details from the customer experience
- Use professional yet warm language
- No slang, no casual internet language, no emojis
- No hashtags
- End with one complete meaningful closing sentence
- Write ONLY the review text, nothing else
- No explanations, no meta text, no word count

Write the complete review now:`;
}

async function generateWithGroq(
  prompt: string,
  apiKey: string
): Promise<string> {
  const response = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert review writer. You write complete, professional, genuine-sounding Google reviews for local Indian businesses. You always write the full review without cutting off. You never use slang or unprofessional language. You follow all instructions exactly.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
        stop: null,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Groq API failed');
  }

  const data = await response.json();
  const review = data.choices?.[0]?.message?.content?.trim();

  if (!review || review.length < 40) {
    throw new Error('Review too short');
  }

  return review;
}

function validateReview(review: string): boolean {
  if (review.length < 40) return false;
  if (review.length > 600) return false;

  const lastChar = review[review.length - 1];
  if (!['.', '!', '?'].includes(lastChar)) return false;

  return true;
}

function fixReview(review: string): string {
  let fixed = review.trim();

  fixed = fixed
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/^\d+\.\s/gm, '')
    .replace(/^[-•]\s/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (fixed.toLowerCase().startsWith('i visited')) {
    fixed = fixed.substring(fixed.indexOf(' ', 10)).trim();
    fixed = fixed.charAt(0).toUpperCase() + fixed.slice(1);
  }

  const lastPunct = Math.max(
    fixed.lastIndexOf('.'),
    fixed.lastIndexOf('!'),
    fixed.lastIndexOf('?')
  );

  if (lastPunct > 30 && lastPunct < fixed.length - 1) {
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
      language,
      answers,
      starRating,
    } = body;

    console.log('Generate review:', {
      businessName,
      businessType,
      language,
      starRating,
    });

    if (
      !businessName ||
      !businessType ||
      !language ||
      !answers ||
      !businessId
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      );
    }

    if (!checkRateLimit(businessId)) {
      return NextResponse.json(
        { error: 'Too many reviews generated. Please try again later.' },
        { status: 429 }
      );
    }

    const answersText = answers
      .map(
        (qa: { question: string; answer: string }) =>
          `- ${qa.question}: ${qa.answer}`
      )
      .join('\n');

    const prompt = buildPrompt(
      businessName,
      businessType,
      answersText,
      starRating
    );

    let review = '';
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      console.log('Attempt', attempts);

      try {
        const raw = await generateWithGroq(prompt, process.env.GROQ_API_KEY);
        const fixed = fixReview(raw);

        if (validateReview(fixed)) {
          review = fixed;
          console.log('Good review on attempt', attempts, ':', review);
          break;
        } else {
          console.log('Review failed validation, retrying...');
        }
      } catch (err: any) {
        console.log('Attempt', attempts, 'failed:', err.message);
        if (attempts === maxAttempts) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempts));
      }
    }

    if (!review) {
      return NextResponse.json(
        { error: 'Could not generate a complete review. Please try again.' },
        { status: 500 }
      );
    }

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
      console.error('DB error:', dbError);
    }

    return NextResponse.json({ review, sessionId: session?.id });
  } catch (err: any) {
    console.error('Final error:', err.message);
    return NextResponse.json(
      { error: 'Failed to generate review. Please try again.' },
      { status: 500 }
    );
  }
}