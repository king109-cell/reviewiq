import { createSupabaseAdmin } from '@/lib/supabaseServer';
import CustomerFlow from './CustomerFlow';
import { notFound } from 'next/navigation';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function ReviewPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createSupabaseAdmin();
  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('slug', params.slug)
    .single();

  if (!business) return notFound();

  return <CustomerFlow business={business} />;
}