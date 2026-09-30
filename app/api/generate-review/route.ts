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

// Convert raw survey dropdown answers into natural conversational feedback
function formatAnswerNaturally(question: string, answer: string): string {
  const cleanAns = answer.trim();
  const lowerAns = cleanAns.toLowerCase();

  // Handle common option keywords smoothly
  if (lowerAns === 'good' || lowerAns === 'very good') return 'tasted great and fresh';
  if (lowerAns === 'acceptable' || lowerAns === 'okay') return 'decent and clean enough';
  if (lowerAns === 'just right') return 'well maintained and comfortable';
  if (lowerAns === 'slow') return 'took a little extra time to come out';
  if (lowerAns === 'fast' || lowerAns === 'very fast') return 'served quickly without delay';
  if (lowerAns === 'unlikely') return 'a bit mixed on whether to come back right away';

  return cleanAns;
}

// Fetch available active models directly from Groq API
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
  const isPositive = starRating >= 4;
  const isNeutral = starRating === 3;

  return `Write ONE authentic, natural Google review for "${businessName}" (${businessType}).

Customer Experience Notes:
${answersText}

STRICT HUMAN-WRITING INSTRUCTIONS:
1. PERSPECTIVE & VOICE:
   - Write as a local resident writing a quick Google Maps review from their phone.
   - Use simple, everyday casual spoken English.
   - NEVER mention country names, national descriptions, or generic labels like "an Indian restaurant", "Indian spot", "a local establishment", or "place in India". Everyone locally already knows where the business is located.

2. TONE (${starRating}/5 Stars):
   ${isPositive 
     ? '- Enthusiastic, genuine, and encouraging.' 
     : isNeutral 
     ? '- Balanced and fair. Mention what was good while politely noting what could be improved, without sounding overly harsh or dramatic.' 
     : '- Constructive and direct about the specific issues experienced.'}

3. ANTI-AI & ANTI-SURVEY RULES:
   - NEVER use corporate or survey phrasing like "food quality was good", "overall experience", "friendly staff", "room for improvement", "I recently visited", "I had a delightful experience", or "I would recommend it to a friend".
   - NEVER start with "I visited", "I went to", "Visited", "As a customer", or "Recently dined".
   - Start directly with a specific detail (e.g., "Stopped by ${businessName}...", "The food at ${businessName}...", "Grabbed a quick bite at ${businessName}...").
   - NO cliché AI words: "exceptional", "unmatched", "testament", "seamless", "strive", "top-notch", "impeccable", "delighted", "kudos", "scrumptious", "ambiance".

4. LENGTH & FORMAT:
   - Write 1 single brief paragraph (2 to 4 short sentences, around 35 to 60 words).
   - Entire review must be in ${language || 'English'}.
   - NO quotes, NO titles, NO headers, NO bullet points, NO emojis, NO markdown.

Write ONLY the review text now:`;
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
                  'You write natural, human-sounding Google reviews for local businesses. You never use formal survey phrases, national references, or AI buzzwords. Output ONLY the raw review text.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.9,
            max_tokens: 180,
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

  // Strip unwanted metadata, headers, or list markers
  fixed = fixed.replace(/^(Title|Review|Option|\d+[\.\)]|\#+)\s*:\s*/gi, '');
  fixed = fixed.replace(/^\d+\.\s*/gm, '');

  if (fixed.includes('2.') || fixed.toLowerCase().includes('title:')) {
    const parts = fixed.split(/(?=\b\d+\.|\bTitle:|\bReview:)/i);
    if (parts.length > 0 && parts[0].trim().length > 20) {
      fixed = parts[0].trim();
    }
  }

  // Strip leftover markdown, quotes, and formatting artifacts
  fixed = fixed
    .replace(/^["']|["']$/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/^[-•]\s/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Hard filter to guarantee no generic nationality labels exist
  fixed = fixed
    .replace(/,\s*a\s+local\s+Indian\s+restaurant/gi, '')
    .replace(/,\s*an\s+Indian\s+restaurant/gi, '')
    .replace(/\s+in\s+India\b/gi, '')
    .replace(/\s+Indian\s+spot\b/gi, ' spot')
    .replace(/\s+local\s+Indian\s+spot\b/gi, ' local spot');

  // Ensure clean sentence ending
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