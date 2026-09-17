import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, google_review_url, owner_email, logo_url } = body;

    const supabase = createSupabaseAdmin();

    // Generate slug
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');

    let slug = baseSlug;
    const { data: existing } = await supabase
      .from('businesses')
      .select('slug')
      .eq('slug', slug)
      .single();

    if (existing) {
      slug = `${baseSlug}-${Math.floor(Math.random() * 900) + 100}`;
    }

    const { data, error } = await supabase
      .from('businesses')
      .insert({
        name,
        type,
        google_review_url,
        owner_email,
        slug,
        logo_url,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ business: data });
  } catch (err: any) {
    console.error('Business create error:', err);
    return NextResponse.json(
      { error: 'Failed to create business' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ business: data });
  } catch (err: any) {
    console.error('Business update error:', err);
    return NextResponse.json(
      { error: 'Failed to update business' },
      { status: 500 }
    );
  }
}