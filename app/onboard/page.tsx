'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import QRDisplay from '@/components/ui/QRDisplay';
import Toast from '@/components/ui/Toast';

type Step = 1 | 2 | 3;
type Mode = 'login' | 'signup';

const BUSINESS_TYPES = [
  { value: 'restaurant', label: '🍽️ Restaurant' },
  { value: 'cafe', label: '☕ Café' },
  { value: 'clinic', label: '🏥 Clinic' },
  { value: 'salon', label: '✂️ Salon' },
  { value: 'other', label: '🏪 Other' },
];

export default function OnboardPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<Step>(1);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('restaurant');
  const [googleUrl, setGoogleUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [urlValid, setUrlValid] = useState<boolean | null>(null);
  const [businessSlug, setBusinessSlug] = useState('');

  const showToast = (msg: string, type: 'success' | 'error' = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return showToast('Please fill in all fields.');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push('/dashboard');
    } catch (err: any) {
      showToast(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!email || !password) return showToast('Please fill in all fields.');
  if (password.length < 8) return showToast('Password must be at least 8 characters.');
  setLoading(true);
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user) {
      setStep(2);
    } else {
      showToast('Check your email to confirm your account, then sign in.');
      setMode('login');
    }
  } catch (err: any) {
    showToast(err.message || 'Signup failed. Try again.');
  } finally {
    setLoading(false);
  }
};

  const testGoogleUrl = () => {
    try {
      const url = new URL(googleUrl);
      const valid = url.hostname.includes('google.com') || url.hostname.includes('g.page');
      setUrlValid(valid);
      if (!valid) showToast('Please enter a valid Google review URL.');
    } catch {
      setUrlValid(false);
      showToast('Please enter a valid URL.');
    }
  };

  const handleBusinessCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !type || !googleUrl) return showToast('Please fill in all required fields.');
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const ownerEmail = session?.user?.email;
      if (!ownerEmail) return showToast('Session expired. Please sign up again.');
      const res = await fetch('/api/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, type,
          google_review_url: googleUrl,
          owner_email: ownerEmail,
          logo_url: logoUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBusinessSlug(data.business.slug);
      setStep(3);
    } catch (err: any) {
      showToast(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const reviewUrl = `${appUrl}/r/${businessSlug}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {toast && <Toast message={toast.msg} type={toast.type} />}

      <div className="mb-8 text-center">
        <span className="text-2xl font-bold text-green-600">ReviewIQ</span>

        {mode === 'signup' && step > 1 && (
          <div className="flex items-center gap-2 mt-4 justify-center">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${step >= s ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {step > s ? '✓' : s}
                </div>
                {s < 3 && <div className={`w-12 h-1 rounded ${step > s ? 'bg-green-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 fade-in">

        {/* LOGIN */}
        {mode === 'login' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h2>
            <p className="text-gray-500 text-sm mb-6">Sign in to your ReviewIQ account.</p>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@business.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-green-600 text-white rounded-2xl font-semibold text-base hover:bg-green-700 transition-colors disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign In →'}
              </button>
            </form>
            <p className="text-center text-sm text-gray-400 mt-4">
              No account?{' '}
              <button onClick={() => setMode('signup')} className="text-green-600 font-medium">
                Create one free
              </button>
            </p>
          </>
        )}

        {/* SIGNUP STEP 1 */}
        {mode === 'signup' && step === 1 && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Create your account</h2>
            <p className="text-gray-500 text-sm mb-6">Free forever. No credit card needed.</p>
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@business.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-green-600 text-white rounded-2xl font-semibold text-base hover:bg-green-700 transition-colors disabled:opacity-60"
              >
                {loading ? 'Creating account...' : 'Continue →'}
              </button>
            </form>
            <p className="text-center text-sm text-gray-400 mt-4">
              Already have an account?{' '}
              <button onClick={() => setMode('login')} className="text-green-600 font-medium">
                Sign in
              </button>
            </p>
          </>
        )}

        {/* SIGNUP STEP 2 */}
        {mode === 'signup' && step === 2 && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Your business</h2>
            <p className="text-gray-500 text-sm mb-6">Takes 60 seconds. You can edit this later.</p>
            <form onSubmit={handleBusinessCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Chai Corner, Dr. Shah's Clinic"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Business Type *</label>
                <div className="grid grid-cols-3 gap-2">
                  {BUSINESS_TYPES.map((bt) => (
                    <button
                      key={bt.value}
                      type="button"
                      onClick={() => setType(bt.value)}
                      className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${type === bt.value ? 'chip-selected' : 'chip-unselected'}`}
                    >
                      {bt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Google Review URL *</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={googleUrl}
                    onChange={(e) => { setGoogleUrl(e.target.value); setUrlValid(null); }}
                    placeholder="https://g.page/r/..."
                    className={`flex-1 px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-100 ${urlValid === true ? 'border-green-500' : urlValid === false ? 'border-red-400' : 'border-gray-200 focus:border-green-500'}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={testGoogleUrl}
                    className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-green-500 transition-colors"
                  >
                    Test
                  </button>
                </div>
                {urlValid === true && <p className="text-green-600 text-xs mt-1">✓ Valid Google URL</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL (optional)</label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-green-600 text-white rounded-2xl font-semibold text-base hover:bg-green-700 transition-colors disabled:opacity-60"
              >
                {loading ? 'Setting up...' : 'Create my ReviewIQ link →'}
              </button>
            </form>
          </>
        )}

        {/* SIGNUP STEP 3 */}
        {mode === 'signup' && step === 3 && (
          <div className="text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">You're live!</h2>
            <p className="text-gray-500 text-sm mb-6">Share this link or print the QR code.</p>
            <div className="bg-green-50 rounded-xl p-4 mb-6">
              <p className="text-xs text-gray-500 mb-2">Your review link</p>
              <p className="text-green-700 font-mono text-sm font-medium break-all">{reviewUrl}</p>
            </div>
            <div className="flex justify-center mb-6">
              <QRDisplay url={reviewUrl} size={200} />
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full h-14 bg-green-600 text-white rounded-2xl font-semibold text-base hover:bg-green-700 transition-colors"
            >
              Go to Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}