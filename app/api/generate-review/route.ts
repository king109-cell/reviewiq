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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessName, businessType, businessId, language, answers, starRating } = body;

    console.log('Generate review called:', { businessName, language, starRating });

    if (!businessName || !businessType || !language || !answers || !businessId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!checkRateLimit(businessId)) {
      return NextResponse.json({ error: 'Too many reviews. Try again later.' }, { status: 429 });
    }

    const answersText = answers
      .map((qa: { question: string; answer: string }) => qa.question + ': ' + qa.answer)
      .join('. ');

    const lang = LANGUAGE_MAP[language] || 'English';

    const sentiment =
      starRating <= 2 ? 'negative and honest about problems' :
      starRating === 3 ? 'mixed with both positives and negatives' :
      'positive and enthusiastic';

    const prompt = 'Write a ' + sentiment + ' Google review in ' + lang + ' for ' + businessName + ' (' + businessType + '). Customer experience: ' + answersText + '. Write 3-5 sentences in first person casual tone. Do not start with I visited. No hashtags. Output the review text only.';

    console.log('Calling Gemini REST API...');

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 1024
      }
    };

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + process.env.GEMINI_API_KEY,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );

    const data = await response.json();
    console.log('API response status:', response.status);

    if (!response.ok) {
      console.error('Gemini API error:', data);
      throw new Error(data.error?.message || 'Gemini API failed');
    }

    const review = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    console.log('Generated review:', review);

    if (!review || review.length < 20) {
      return NextResponse.json({ error: 'Could not generate review' }, { status: 500 });
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
        posted: false
      })
      .select()
      .single();

    if (dbError) {
      console.error('DB error:', dbError);
    }

    return NextResponse.json({ review, sessionId: session?.id });

  } catch (err: any) {
    console.error('Generate review error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate review' },
      { status: 500 }
    );
  }
}