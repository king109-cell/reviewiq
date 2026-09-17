'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import QRDisplay from '@/components/ui/QRDisplay';
import Toast from '@/components/ui/Toast';

export default function QRPage() {
  const [reviewUrl, setReviewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: biz } = await supabase
        .from('businesses')
        .select('slug')
        .eq('owner_email', user?.email)
        .single();
      if (biz) {
        setReviewUrl(
          `${process.env.NEXT_PUBLIC_APP_URL}/r/${biz.slug}`
        );
      }
      setLoading(false);
    }
    load();
  }, []);

  const copyLink = async () => {
    await navigator.clipboard.writeText(reviewUrl);
    setToast('Link copied!');
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
    <div className="max-w-lg">
      {toast && <Toast message={toast} type="success" />}
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Your QR Code</h1>
      <p className="text-gray-500 text-sm mb-8">
        Print this QR code and place it at your counter, tables, or entrance.
        Every scan opens a personalised review flow.
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 p-8 flex flex-col items-center gap-6">
        <QRDisplay url={reviewUrl} size={256} />

        <div className="w-full bg-gray-50 rounded-xl p-3 text-sm text-gray-600 font-mono break-all text-center">
          {reviewUrl}
        </div>

        <button
          onClick={copyLink}
          className="w-full h-12 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-green-500 hover:text-green-700 transition-colors"
        >
          📋 Copy Link
        </button>
      </div>

      <div className="mt-6 bg-blue-50 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">
          🔵 NFC Card Setup
        </h3>
        <p className="text-sm text-blue-700 leading-relaxed">
          Program any NFC card or tag with the URL above using any NFC writing
          app. Customers tap the card to instantly open their review flow — no
          camera needed.
        </p>
      </div>
    </div>
  );
}