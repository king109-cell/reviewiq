'use client';

import { useState } from 'react';
import { Question } from '@/types';
import { getQuestionText, getOptionText } from '@/lib/questions';

interface Props {
  question: Question;
  language: string;
  onAnswer: (answer: string) => void;
}

const EMOJIS = [
  { emoji: '😐', label: { english: 'Okay', hindi: 'ठीक था', gujarati: 'ઠीक' } },
  { emoji: '🙂', label: { english: 'Good', hindi: 'अच्छा', gujarati: 'સારો' } },
  { emoji: '😊', label: { english: 'Great', hindi: 'बहुत अच्छा', gujarati: 'ઘણો સારો' } },
  { emoji: '😍', label: { english: 'Amazing!', hindi: 'लाजवाब!', gujarati: 'અद्भुत!' } },
];

const EMOJI_VALUES = ['Okay', 'Good', 'Great', 'Amazing'];

export default function QuestionStep({ question, language, onAnswer }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [textVal, setTextVal] = useState('');
  const [emojiIdx, setEmojiIdx] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);

  const questionText = getQuestionText(question, language);

  const handleChipSelect = (value: string) => {
    if (answered) return;
    setSelected(value);
    setAnswered(true);
    setTimeout(() => onAnswer(value), 400);
  };

  const handleEmojiSelect = (idx: number) => {
    if (answered) return;
    setEmojiIdx(idx);
    setAnswered(true);
    setTimeout(() => onAnswer(EMOJI_VALUES[idx]), 400);
  };

  const handleTextSubmit = () => {
    if (!textVal.trim() || answered) return;
    setAnswered(true);
    onAnswer(textVal.trim());
  };

  return (
    <div className="flex-1 flex flex-col px-6 pb-8 fade-in">
      <div className="flex-1 flex flex-col justify-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 leading-snug">
          {questionText}
        </h2>

        {/* Chips */}
        {question.input_type === 'chips' && (
          <div className="flex flex-wrap gap-3">
            {(question.options || []).map((opt, i) => {
              const label =
                typeof opt === 'string' ? opt : getOptionText(opt, language);
              const isSelected = selected === label;
              return (
                <button
                  key={i}
                  onClick={() => handleChipSelect(label)}
                  className={`px-5 py-3 rounded-full border-2 text-sm font-medium transition-all duration-200 active:scale-95 ${
                    isSelected
                      ? 'chip-selected shadow-md scale-105'
                      : 'chip-unselected hover:border-green-300'
                  }`}
                >
                  {isSelected && <span className="mr-1">✓</span>}
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Emoji Slider */}
        {question.input_type === 'emoji_slider' && (
          <div className="flex justify-between items-end gap-2">
            {EMOJIS.map((e, i) => {
              const isSelected = emojiIdx === i;
              const labelText =
                (e.label as any)[language] || e.label.english;
              return (
                <button
                  key={i}
                  onClick={() => handleEmojiSelect(i)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-200 active:scale-90 flex-1 ${
                    isSelected
                      ? 'bg-green-100 ring-2 ring-green-500 scale-110'
                      : 'bg-gray-50 hover:bg-green-50'
                  }`}
                >
                  <span
                    className={`transition-all duration-200 ${
                      isSelected ? 'text-5xl' : 'text-4xl'
                    }`}
                  >
                    {e.emoji}
                  </span>
                  <span className="text-xs text-gray-500 text-center leading-tight">
                    {labelText}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Text Input */}
        {question.input_type === 'text' && (
          <div className="space-y-4">
            <textarea
              value={textVal}
              onChange={(e) => setTextVal(e.target.value)}
              placeholder={
                language === 'hindi'
                  ? 'यहाँ लिखें...'
                  : language === 'gujarati'
                  ? 'અहीं લખો...'
                  : 'Type here...'
              }
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleTextSubmit();
                }
              }}
            />
            <button
              onClick={handleTextSubmit}
              disabled={!textVal.trim() || answered}
              className="w-full h-14 bg-green-600 text-white rounded-2xl font-semibold text-base hover:bg-green-700 transition-colors disabled:opacity-40"
            >
              {language === 'hindi'
                ? 'आगे →'
                : language === 'gujarati'
                ? 'આગળ →'
                : 'Next →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}