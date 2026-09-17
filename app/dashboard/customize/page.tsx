'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Business } from '@/types';
import Toast from '@/components/ui/Toast';

interface CustomQuestion {
  id: string;
  text_en: string;
  input_type: 'text' | 'chips';
  options: string[];
  enabled: boolean;
}

const EMPTY_Q = (): CustomQuestion => ({
  id: Math.random().toString(36).substring(7),
  text_en: '',
  input_type: 'text',
  options: [],
  enabled: true,
});

export default function CustomizePage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [questions, setQuestions] = useState<CustomQuestion[]>([EMPTY_Q()]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [optionInputs, setOptionInputs] = useState<string[]>(['']);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: biz } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_email', user?.email)
        .single();
      if (!biz) return;
      setBusiness(biz);

      const cqs = biz.custom_questions || [];
      if (cqs.length > 0) {
        const loaded = cqs.map((cq: any) => ({
          id: cq.id || Math.random().toString(36).substring(7),
          text_en: cq.text_en || '',
          input_type: cq.input_type || 'text',
          options: cq.options || [],
          enabled: true,
        }));
        setQuestions(loaded);
        setOptionInputs(loaded.map((q: CustomQuestion) => q.options.join(', ')));
      }
    }
    load();
  }, []);

  const addQuestion = () => {
    if (questions.length >= 5) return;
    setQuestions([...questions, EMPTY_Q()]);
    setOptionInputs([...optionInputs, '']);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
    setOptionInputs(optionInputs.filter((_, i) => i !== index));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newQs = [...questions];
    const newOpts = [...optionInputs];
    [newQs[index], newQs[index - 1]] = [newQs[index - 1], newQs[index]];
    [newOpts[index], newOpts[index - 1]] = [newOpts[index - 1], newOpts[index]];
    setQuestions(newQs);
    setOptionInputs(newOpts);
  };

  const moveDown = (index: number) => {
    if (index === questions.length - 1) return;
    const newQs = [...questions];
    const newOpts = [...optionInputs];
    [newQs[index], newQs[index + 1]] = [newQs[index + 1], newQs[index]];
    [newOpts[index], newOpts[index + 1]] = [newOpts[index + 1], newOpts[index]];
    setQuestions(newQs);
    setOptionInputs(newOpts);
  };

  const updateQ = (index: number, field: keyof CustomQuestion, value: any) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
  };

  const handleOptionInput = (index: number, value: string) => {
    const newOpts = [...optionInputs];
    newOpts[index] = value;
    setOptionInputs(newOpts);
    const opts = value.split(',').map((o) => o.trim()).filter(Boolean);
    updateQ(index, 'options', opts);
  };

  const save = async () => {
    if (!business) return;
    const valid = questions.filter((q) => q.text_en.trim() !== '');
    if (valid.length === 0) return;
    setSaving(true);
  

    console.log('Saving questions:', valid);
    const toSave = valid.map((q) => ({
      id: q.id,
      text_en: q.text_en,
      text_hi: q.text_en,
      text_gu: q.text_en,
      input_type: q.input_type,
      options: q.input_type === 'chips' ? q.options : [],
      enabled: true,
    }));

    const { error } = await supabase
      .from('businesses')
      .update({ custom_questions: toSave })
      .eq('id', business.id);

    setSaving(false);
    if (error) {
      setToast({ msg: 'Failed to save. Try again.', type: 'error' });
    } else {
      setToast({ msg: 'Questions saved! ✓', type: 'success' });
    }
    setTimeout(() => setToast(null), 2500);
  };

  if (!business) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {toast && <Toast message={toast.msg} type={toast.type} />}

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Your Questions</h1>
        <span className="text-xs text-gray-400">{questions.length}/5 questions</span>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Add your own questions. Choose text answer or tap options. Drag to reorder.
      </p>

      <div className="space-y-4 mb-6">
        {questions.map((q, index) => (
          <div key={q.id} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Question {index + 1}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-green-400 hover:text-green-600 disabled:opacity-30 transition-colors text-xs"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === questions.length - 1}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-green-400 hover:text-green-600 disabled:opacity-30 transition-colors text-xs"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeQuestion(index)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-red-100 text-red-400 hover:bg-red-50 transition-colors text-xs"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mb-3">
              <label className="text-xs text-gray-500 mb-1 block">Question Text</label>
              <input
                type="text"
                value={q.text_en}
                onChange={(e) => updateQ(index, 'text_en', e.target.value)}
                placeholder="e.g. How was the ambience?"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div className="mb-3">
              <label className="text-xs text-gray-500 mb-2 block">Answer Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => updateQ(index, 'input_type', 'text')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${q.input_type === 'text' ? 'chip-selected' : 'chip-unselected'}`}
                >
                  ✏️ Text
                </button>
                <button
                  onClick={() => updateQ(index, 'input_type', 'chips')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${q.input_type === 'chips' ? 'chip-selected' : 'chip-unselected'}`}
                >
                  🔘 Options
                </button>
              </div>
            </div>

            {q.input_type === 'chips' && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Options (comma separated)
                </label>
                <input
                  type="text"
                  value={optionInputs[index] || ''}
                  onChange={(e) => handleOptionInput(index, e.target.value)}
                  placeholder="e.g. Cozy, Loud, Perfect, Romantic"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                />
                {q.options.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {q.options.map((opt, i) => (
                      <span key={i} className="px-3 py-1 rounded-full border border-gray-200 text-xs text-gray-600 bg-white">
                        {opt}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {questions.length < 5 && (
        <button
          onClick={addQuestion}
          className="w-full h-12 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-400 hover:border-green-400 hover:text-green-600 transition-colors mb-6"
        >
          + Add Question
        </button>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="w-full h-14 bg-green-600 text-white rounded-2xl font-semibold text-base hover:bg-green-700 transition-colors disabled:opacity-60"
      >
        {saving ? 'Saving...' : 'Save Questions'}
      </button>
    </div>
  );
}