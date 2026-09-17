'use client';

import { useState, useEffect, useCallback } from 'react';
import { Business, QA } from '@/types';
import { t, Lang } from '@/lib/translations';
import LanguageSelect from '@/components/customer/LanguageSelect';
import QuestionStep from '@/components/customer/QuestionStep';
import GeneratingScreen from '@/components/customer/GeneratingScreen';
import ReviewReady from '@/components/customer/ReviewReady';
import ThankYou from '@/components/customer/ThankYou';
import ProgressBar from '@/components/ui/ProgressBar';
import Toast from '@/components/ui/Toast';
import { Question } from '@/types';

type FlowScreen = 'language' | 'questions' | 'generating' | 'review' | 'thankyou';

interface Props {
  business: Business;
}

export default function CustomerFlow({ business }: Props) {
  const [screen, setScreen] = useState<FlowScreen>('questions');
  const [language, setLanguage] = useState<Lang>('english');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<QA[]>([]);
  const [generatedReview, setGeneratedReview] = useState('');
  const [starRating, setStarRating] = useState(5);
  const [toast, setToast] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);

  const tr = t(language);

  useEffect(() => {
    const customQs: Question[] = (business.custom_questions || [])
      .filter((cq: any) => cq.text_en && cq.text_en.trim() !== '')
      .map((cq: any) => ({
        id: cq.id,
        text_en: cq.text_en,
        text_hi: cq.text_hi || cq.text_en,
        text_gu: cq.text_gu || cq.text_en,
        input_type: cq.input_type || 'text',
        options: cq.input_type === 'chips'
          ? (cq.options || []).map((opt: string) => ({ en: opt, hi: opt, gu: opt }))
          : undefined,
        enabled: true,
      }));
    setAllQuestions(customQs);
  }, [business]);

  const totalSteps = allQuestions.length;

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && screen === 'review') {
        setScreen('thankyou');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [screen]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleLanguageSelect = (lang: Lang) => {
    setLanguage(lang);
    setTimeout(() => {
      setAnimating(true);
      setTimeout(() => {
        setScreen('questions');
        setAnimating(false);
      }, 300);
    }, 150);
  };

  const generateReview = useCallback(
    async (finalAnswers: QA[], rating = 5) => {
      try {
        const res = await fetch('/api/generate-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: business.name,
            businessType: business.type,
            businessId: business.id,
            language,
            answers: finalAnswers,
            starRating: rating,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setGeneratedReview(data.review);
        setScreen('review');
      } catch (err: any) {
        showToast(tr.error_generate || 'Something went wrong. Try again.');
        setScreen('review');
        setGeneratedReview('');
      }
    },
    [business, language, tr]
  );

  const handleAnswer = useCallback(
    (answer: string) => {
      const question = allQuestions[currentQ];
      const questionText = question.text_en;
      const newAnswers = [...answers, { question: questionText, answer }];
      setAnswers(newAnswers);

      setTimeout(() => {
        if (currentQ + 1 >= totalSteps) {
          setScreen('generating');
          generateReview(newAnswers);
        } else {
          setAnimating(true);
          setTimeout(() => {
            setCurrentQ(currentQ + 1);
            setAnimating(false);
          }, 300);
        }
      }, 400);
    },
    [currentQ, answers, allQuestions, totalSteps, generateReview]
  );

  const handleRetry = () => {
    setScreen('generating');
    setGeneratedReview('');
    generateReview(answers, starRating);
  };

  const handlePostToGoogle = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(generatedReview);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = generatedReview;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
    } catch (err) {
      console.error('Clipboard error:', err);
    }
    setTimeout(() => {
      window.open(business.google_review_url, '_blank');
    }, 300);
  };

  // No questions added yet
  if (allQuestions.length === 0 && screen === 'questions') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl mb-4">⚙️</p>
        <p className="text-gray-500 text-sm">
          This business has not set up any questions yet.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50 flex flex-col items-center justify-start">
      {toast && <Toast message={toast} type="error" />}

      <div className="w-full max-w-[420px] min-h-screen bg-white shadow-sm flex flex-col relative overflow-hidden">
        {screen === 'questions' && totalSteps > 0 && (
          <ProgressBar current={currentQ + 1} total={totalSteps} />
        )}

        {(screen === 'language' || screen === 'questions') && (
          <div className="px-6 pt-8 pb-4 flex items-center gap-3">
            {business.logo_url && (
              <img
                src={business.logo_url}
                alt={business.name}
                className="w-10 h-10 rounded-xl object-cover"
              />
            )}
            <div>
              <p className="font-semibold text-gray-900 text-sm">{business.name}</p>
              <p className="text-xs text-gray-400 capitalize">{business.type}</p>
            </div>
          </div>
        )}

        <div className={`flex-1 flex flex-col ${animating ? 'slide-exit' : 'slide-enter'}`}>
          {screen === 'language' && (
            <LanguageSelect
              businessName={business.name}
              onSelect={handleLanguageSelect}
            />
          )}

          {screen === 'questions' && allQuestions[currentQ] && (
            <QuestionStep
              key={currentQ}
              question={allQuestions[currentQ]}
              language={language}
              onAnswer={handleAnswer}
            />
          )}

          {screen === 'generating' && (
            <GeneratingScreen language={language} />
          )}

          {screen === 'review' && (
            <ReviewReady
              review={generatedReview}
              language={language}
              starRating={starRating}
              onStarChange={setStarRating}
              onRetry={handleRetry}
              onPost={handlePostToGoogle}
              overlayText={tr.paste_overlay || 'Paste into Google → Hit Post ⭐'}
            />
          )}

          {screen === 'thankyou' && (
            <ThankYou language={language} businessName={business.name} />
          )}
        </div>
      </div>
    </div>
  );
}