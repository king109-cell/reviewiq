'use client';

import { useState } from 'react';
import { t, Lang } from '@/lib/translations';

interface Props {
  review: string;
  language: Lang;
  starRating: number;
  onStarChange: (n: number) => void;
  onRetry: () => void;
  onPost: () => void;
  overlayText: string;
}

export default function ReviewReady({
  review,
  language,
  starRating,
  onStarChange,
  onRetry,
  onPost,
  overlayText,
}: Props) {
  const tr = t(language);
  const [editing, setEditing] = useState(false);
  const [editedReview, setEditedReview] = useState(review);
  const [showOverlay, setShowOverlay] = useState(false);

  const handlePost = () => {
    setShowOverlay(true);
    onPost();
    setTimeout(() => setShowOverlay(false), 5000);
  };

  return (
    <div className="flex-1 flex flex-col px-6 pb-8 pt-4 fade-in">
      <h2 className="text-xl font-bold text-gray-900 mb-4">{tr.review_ready}</h2>

      {/* Star Rating */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">{tr.stars}</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => onStarChange(n)}
              className={`text-3xl transition-transform active:scale-90 ${
                n <= starRating ? 'opacity-100' : 'opacity-30'
              }`}
            >
              ⭐
            </button>
          ))}
        </div>
      </div>

      {/* Review Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-4 shadow-sm flex-1">
        {editing ? (
          <textarea
            value={editedReview}
            onChange={(e) => setEditedReview(e.target.value)}
            className="w-full h-full min-h-[120px] text-sm text-gray-700 leading-relaxed resize-none focus:outline-none"
          />
        ) : (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {editedReview || review}
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-3">
        <button
          onClick={() => setEditing(!editing)}
          className="flex-1 h-12 border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-600 hover:border-green-400 transition-colors"
        >
          {editing ? '✓ Done' : tr.edit}
        </button>
        <button
          onClick={onRetry}
          className="flex-1 h-12 border-2 border-gray-200 rounded-2xl text-sm font-medium text-gray-600 hover:border-green-400 transition-colors"
        >
          {tr.try_again}
        </button>
      </div>

      <button
        onClick={handlePost}
        className="w-full h-14 bg-green-600 text-white rounded-2xl font-semibold text-base hover:bg-green-700 transition-colors"
        style={{ animation: 'pulse-green 2s infinite' }}
      >
        {tr.post_to_google}
      </button>

      {/* Overlay */}
      {showOverlay && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[420px] shadow-xl fade-in">
            <div className="text-4xl text-center mb-3">📋</div>
            <p className="text-center font-semibold text-gray-900 text-lg">
              {overlayText}
            </p>
            <p className="text-center text-sm text-gray-400 mt-2">
              {language === 'hindi'
                ? 'Review copy हो गया है'
                : language === 'gujarati'
                ? 'Review copy થઈ ગઈ છે'
                : 'Review copied to clipboard'}
            </p>
            <button
              onClick={() => setShowOverlay(false)}
              className="w-full mt-4 h-12 border border-gray-200 rounded-xl text-sm text-gray-500"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}