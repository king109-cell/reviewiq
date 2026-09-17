'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ReviewSession } from '@/types';
import SessionsTable from '@/components/dashboard/SessionsTable';
import Toast from '@/components/ui/Toast';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_email', user?.email)
        .single();
      if (!biz) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('review_sessions')
        .select('*')
        .eq('business_id', biz.id)
        .order('created_at', { ascending: false });
      setSessions(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setToast('Copied!');
    setTimeout(() => setToast(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {toast && <Toast message={toast} type="success" />}
      <h1 className="text-2xl font-bold text-gray-900 mb-2">All Reviews</h1>
      <p className="text-gray-500 text-sm mb-6">
        {sessions.length} reviews generated
      </p>
      <SessionsTable sessions={sessions} onCopy={copy} />
    </div>
  );
}