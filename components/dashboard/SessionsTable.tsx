'use client';

import { useState } from 'react';
import { ReviewSession } from '@/types';

interface Props {
  sessions: ReviewSession[];
  onCopy: (text: string) => void;
}

export default function SessionsTable({ sessions, onCopy }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <p className="text-4xl mb-3">⭐</p>
        <p className="text-gray-500">
          No reviews yet. Share your QR code to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <div
          key={s.id}
          className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
        >
          {/* Row */}
          <button
            className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
            onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 truncate">
                {s.generated_review}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-gray-400 capitalize">
                {s.language}
              </span>
              <span className="text-sm">{'⭐'.repeat(s.star_rating)}</span>
              <span className="text-xs text-gray-400">
                {new Date(s.created_at).toLocaleDateString()}
              </span>
              <span className="text-gray-400 text-xs">
                {expandedId === s.id ? '▲' : '▼'}
              </span>
            </div>
          </button>

          {/* Expanded */}
          {expandedId === s.id && (
            <div className="px-5 pb-5 border-t border-gray-100">
              <p className="text-sm text-gray-700 leading-relaxed mt-4 mb-4 whitespace-pre-wrap">
                {s.generated_review}
              </p>

              {/* Q&A */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Customer Answers
                </p>
                {s.answers?.map((qa: any, i: number) => (
                  <div key={i}>
                    <p className="text-xs text-gray-500">{qa.question}</p>
                    <p className="text-sm text-gray-800 font-medium">
                      {qa.answer}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onCopy(s.generated_review)}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-xl font-medium hover:bg-green-700 transition-colors"
              >
                Copy Review
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}