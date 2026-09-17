'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: '📊' },
  { href: '/dashboard/qr', label: 'QR Code', icon: '📱' },
  { href: '/dashboard/sessions', label: 'Reviews', icon: '⭐' },
  { href: '/dashboard/customize', label: 'Customize', icon: '🎨' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/onboard');
  };

  return (
    <aside className="w-56 bg-white border-r border-gray-100 flex flex-col py-6 px-3 min-h-screen shrink-0">
      <div className="px-3 mb-8">
        <span className="text-lg font-bold text-green-600">ReviewIQ</span>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-green-50 text-green-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={handleSignOut}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors mt-4"
      >
        <span>🚪</span>
        Sign out
      </button>
    </aside>
  );
}