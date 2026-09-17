'use client';

interface Props {
  message: string;
  type?: 'success' | 'error';
}

export default function Toast({ message, type = 'error' }: Props) {
  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white max-w-[380px] text-center fade-in ${
        type === 'success' ? 'bg-green-600' : 'bg-gray-900'
      }`}
    >
      {message}
    </div>
  );
}