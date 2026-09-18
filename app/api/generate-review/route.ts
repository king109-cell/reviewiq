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

// Clean any AI thinking or meta text from response
function cleanReview(raw: string): string {
  if (!raw) return '';

  // If response has numbered steps or asterisks it is thinking output
  // Extract only clean paragraph text
  const lines = raw.split('\n');
  
  const cleanLines = lines.filter(line => {
    const l = line.trim();
    if (!l) return false;
    if (/^\d+[\.\)]/.test(l)) return false;
    if (/^\*\*/.test(l)) return false;
    if (/^\*[^*]/.test(l) && l.length < 50) return false;
    if (/^(note|output|review:|here|begin|rule|word count|verification|let me|okay|sure|great)/i.test(l)) return false;
    if (/\*\*[A-Za-z\s]+\*\*/.test(l) && l.length < 80) return false;
    return true;
  });

  let result = cleanLines
    .join(' ')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove incomplete last sentence
  const lastPunct = Math.max(
    result.lastIndexOf('.'),
    result.lastIndexOf('!'),
    result.lastIndexOf('?')
  );

  if (lastPunct > 30 && lastPunct < result.length - 1) {
    result = result.substring(0, lastPunct + 1);
  }

  return result.trim();
}

// Retry logic — try up to 3 times
async function callGeminiWithRetry(
  prompt: string,
  apiKey: string,
  attempts = 3
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    try {
      console.log('Gemini attempt', i + 1);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + apiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 500,
            },
          }),
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const err = await response.json();
        console.error('Gemini error attempt', i + 1, err);
        if (i === attempts - 1) throw new Error(err.error?.message || 'Gemini failed');
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }

      const data = await response.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!raw) {
        if (i === attempts - 1) throw new Error('Empty response');
        continue;
      }

      const cleaned = cleanReview(raw);
      console.log('Raw length:', raw.length, 'Cleaned:', cleaned.substring(0, 80));

      if (cleaned.length < 30) {
        console.log('Review too short, retrying...');
        if (i === attempts - 1) throw new Error('Review too short after cleaning');
        continue;
      }

      return cleaned;

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Timeout on attempt', i + 1);
        if (i === attempts - 1) throw new Error('Request timed out. Please try again.');
      } else {
        if (i === attempts - 1) throw err;
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('All attempts failed');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { businessName, businessType, businessId, language, answers, starRating } = body;

    console.log('Generate review:', { businessName, language, starRating });

    if (!businessName || !businessType || !language || !answers || !businessId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    if (!checkRateLimit(businessId)) {
      return NextResponse.json({ error: 'Too many reviews. Try again in an hour.' }, { status: 429 });
    }

    const answersText = answers
      .map((qa: { question: string; answer: string }) => qa.question + ': ' + qa.answer)
      .join('. ');

    const lang = LANGUAGE_MAP[language] || 'English';

    const sentiment =
      starRating <= 2 ? 'negative and critical' :
      starRating === 3 ? 'mixed and balanced' :
      'positive and warm';

    const prompt = `Write a ${sentiment} Google review in ${lang} for ${businessName}.
Customer said: ${answersText}
Instructions: Write ONLY the review. 4 complete sentences. First person. Casual tone. No hashtags. Do not start with I visited. End with a complete sentence. Nothing else.`;

    const review = await callGeminiWithRetry(
      prompt,
      process.env.GEMINI_API_KEY,
      3
    );

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
      { error: err.message || 'Failed to generate review' },
      { status: 500 }
    );
  }
}