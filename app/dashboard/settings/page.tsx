'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Business, BusinessType } from '@/types';
import Toast from '@/components/ui/Toast';

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'restaurant', label: '🍽️ Restaurant' },
  { value: 'cafe', label: '☕ Café' },
  { value: 'clinic', label: '🏥 Clinic' },
  { value: 'salon', label: '✂️ Salon' },
  { value: 'other', label: '🏪 Other' },
];

export default function SettingsPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'restaurant' as BusinessType,
    google_review_url: '',
    logo_url: '',
  });
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [urlValid, setUrlValid] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{
    msg: string;
    type: 'success' | 'error';
  } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: biz } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_email', user?.email)
        .single();
      if (biz) {
        setBusiness(biz);
        setForm({
          name: biz.name,
          type: biz.type,
          google_review_url: biz.google_review_url,
          logo_url: biz.logo_url || '',
        });
      }
    }
    load();
  }, []);

  const testUrl = () => {
    try {
      const url = new URL(form.google_review_url);
      const valid =
        url.hostname.includes('google.com') ||
        url.hostname.includes('g.page');
      setUrlValid(valid);
      if (!valid) showToast('Does not look like a Google URL.', 'error');
    } catch {
      setUrlValid(false);
      showToast('Invalid URL.', 'error');
    }
  };

  const saveProfile = async () => {
    if (!business) return;
    setSaving(true);
    const res = await fetch('/api/business', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: business.id, ...form }),
    });
    setSaving(false);
    if (res.ok) showToast('Settings saved!');
    else showToast('Failed to save. Try again.', 'error');
  };

  const changePassword = async () => {
    if (newPassword.length < 8)
      return showToast('Password must be 8+ characters.', 'error');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) showToast(error.message, 'error');
    else {
      setNewPassword('');
      showToast('Password updated!');
    }
  };

  const deleteAccount = async () => {
    if (!business) return;
    setDeleting(true);
    await supabase
      .from('review_sessions')
      .delete()
      .eq('business_id', business.id);
    await supabase.from('businesses').delete().eq('id', business.id);
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  if (!business) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {toast && <Toast message={toast.msg} type={toast.type} />}

      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Business Profile */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
          Business Profile
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Business Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-2 block">Type</label>
            <div className="flex flex-wrap gap-2">
              {BUSINESS_TYPES.map((bt) => (
                <button
                  key={bt.value}
                  type="button"
                  onClick={() => setForm({ ...form, type: bt.value })}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    form.type === bt.value
                      ? 'chip-selected'
                      : 'chip-unselected'
                  }`}
                >
                  {bt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Google Review URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={form.google_review_url}
                onChange={(e) => {
                  setForm({ ...form, google_review_url: e.target.value });
                  setUrlValid(null);
                }}
                className={`flex-1 px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-100 ${
                  urlValid === true
                    ? 'border-green-500'
                    : urlValid === false
                    ? 'border-red-400'
                    : 'border-gray-200 focus:border-green-500'
                }`}
              />
              <button
                onClick={testUrl}
                className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:border-green-500 transition-colors"
              >
                Test
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Logo URL
            </label>
            <input
              type="url"
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="w-full h-12 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
          Change Password
        </h2>
        <div className="flex gap-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min. 8 chars)"
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
          <button
            onClick={changePassword}
            className="px-5 py-3 bg-gray-900 text-white text-sm rounded-xl font-medium hover:bg-gray-800 transition-colors"
          >
            Update
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-2xl border border-red-100 p-6">
        <h2 className="text-sm font-semibold text-red-600 mb-4 uppercase tracking-wide">
          Danger Zone
        </h2>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-5 py-3 border border-red-200 text-red-600 text-sm rounded-xl font-medium hover:bg-red-50 transition-colors"
          >
            Delete Account & All Data
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-700 font-medium">
              This will permanently delete your account, business, and all
              reviews. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="px-5 py-3 bg-red-600 text-white text-sm rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Everything'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-5 py-3 border border-gray-200 text-gray-600 text-sm rounded-xl font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}