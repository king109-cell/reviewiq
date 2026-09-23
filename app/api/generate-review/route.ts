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

// Fetch currently available models directly from Groq to avoid 404 errors
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
        ?.filter((id: string) => !id.includes('whisper') && !id.includes('guard'));

      if (models && models.length > 0) {
        console.log('Fetched active Groq models:', models);
        return models;
      }
    }
  } catch (err) {
    console.error('Failed to fetch dynamic model list from Groq:', err);
  }

  // Fallback defaults if models endpoint fails
  return [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
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
                'You write professional, authentic, highly favorable, and well-crafted Google reviews for local businesses. Your review must be articulate, polite, and warmly recommend the business based on the user provided feedback. Output ONLY the review text. No introductory remarks, no quotes, no explanations, no numbering, and no hashtags.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7, // Lower temperature slightly for a more polished and professional tone
          max_completion_tokens: 250,
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

      if (review && review.length > 20) {
        console.log('Success with model:', model);
        return review;
      }
    } catch (err: any) {
      if (err.message.includes('Invalid Groq API Key')) throw err;
      console.error(`[Model Failed] ${model}:`, err);
      continue;
    }
  }

  throw new Error('All Groq models failed. Check console logs for exact error details.');
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

    // Constructing a prompt that enforces a professional, business-favorable tone based on customer answers
    const prompt = `Write a highly favorable, extremely professional Google review in ${lang} for ${businessName} (a ${businessType} business). 
Customer Feedback Details: ${answersText}. 
Guidelines:
- Express genuine appreciation, highlighting specific details from the customer's feedback.
- Maintain a highly professional, respectful, and articulate tone.
- Strongly advocate for and recommend this business.
- Write 3 to 4 complete sentences in first-person perspective.
- Avoid informal slang, conversational filler, or starting with "I visited".
- Provide ONLY the review text.`;

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