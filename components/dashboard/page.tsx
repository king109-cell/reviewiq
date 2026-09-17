'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import MetricCard from '@/components/dashboard/MetricCard';
import { Business, ReviewSession } from '@/types';

export default function DashboardOverview() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: biz } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_email', user.email)
        .single();

      if (!biz) {
        setLoading(false);
        return;
      }
      setBusiness(biz);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: sess } = await supabase
        .from('review_sessions')
        .select('*')
        .eq('business_id', biz.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      setSessions(sess || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">No business found.</p>
        <a href="/onboard" className="text-green-600 font-medium mt-2 block">
          Complete setup
        </a>
      </div>
    );
  }

  const avgStars =
    sessions.length
      ? (
          sessions.reduce((s, r) => s + r.star_rating, 0) / sessions.length
        ).toFixed(1)
      : '—';

  const langCounts = sessions.reduce(
    (acc: Record<string, number>, s) => {
      acc[s.language] = (acc[s.language] || 0) + 1;
      return acc;
    },
    {}
  );

  const topLang =
    Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  const chartData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const dateStr = d.toISOString().split('T')[0];
    const count = sessions.filter((s) =>
      s.created_at.startsWith(dateStr)
    ).length;
    return {
      date: d.toLocaleDateString('en', {
        month: 'short',
        day: 'numeric',
      }),
      reviews: count,
    };
  });

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{business.name}</h1>
        <p className="text-gray-500 text-sm capitalize">
          {business.type} · {sessions.length} reviews this month
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total Scans"
          value={sessions.length.toString()}
          icon="📱"
        />
        <MetricCard
          label="Reviews Generated"
          value={sessions.length.toString()}
          icon="✍️"
        />
        <MetricCard
          label="Top Language"
          value={topLang}
          icon="🌐"
        />
        <MetricCard
          label="Avg Stars"
          value={avgStars}
          icon="⭐"
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Reviews — Last 30 days
        </h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid #E5E7EB',
                fontSize: '12px',
              }}
            />
            <Line
              type="monotone"
              dataKey="reviews"
              stroke="#16A34A"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#16A34A' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}