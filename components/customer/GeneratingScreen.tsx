'use client';

import { useState, useEffect } from 'react';
import { t, Lang } from '@/lib/translations';

interface Props {
  language: Lang;
}

export default function GeneratingScreen({ language }: Props) {
  const tr = t(language);
  const messages = [tr.generating_1, tr.generating_2, tr.generating_3];
  const [msgIdx, setMsgIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setMsgIdx((prev) => (prev + 1) % messages.length);
        setFade(true);
      }, 200);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 fade-in">
      <div className="spinner mb-8" />
      <p
        className={`text-gray-600 text-base text-center font-medium transition-opacity duration-200 ${
          fade ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {messages[msgIdx]}
      </p>
    </div>
  );
}