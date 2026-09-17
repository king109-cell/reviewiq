'use client';

import { t, Lang } from '@/lib/translations';

interface Props {
  language: Lang;
  businessName: string;
}

export default function ThankYou({ language, businessName }: Props) {
  const tr = t(language);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 fade-in text-center">
      {/* Animated checkmark */}
      <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <svg className="w-12 h-12" viewBox="0 0 52 52" fill="none">
          <circle
            cx="26"
            cy="26"
            r="25"
            stroke="#16A34A"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M14 26 L22 34 L38 18"
            stroke="#16A34A"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="100"
            strokeDashoffset="0"
            style={{ animation: 'checkmark 0.6s ease forwards' }}
          />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-3">{tr.thank_you}</h2>
      <p className="text-gray-500 text-sm leading-relaxed max-w-xs">
        {tr.thank_you_sub}
      </p>

      <div className="mt-8 bg-green-50 rounded-2xl px-6 py-4">
        <p className="text-green-700 text-sm font-medium">
          {language === 'hindi'
            ? `${businessName} को आपकी समीक्षा का इंतज़ार था 💚`
            : language === 'gujarati'
            ? `${businessName} ને તમારी સमीक्षानी રाह હती 💚`
            : `${businessName} appreciates every word. 💚`}
        </p>
      </div>
    </div>
  );
}