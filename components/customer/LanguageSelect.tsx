'use client';

interface Props {
  businessName: string;
  onSelect: (lang: any) => void;
}

const LANGUAGES = [
  { code: 'hindi', label: 'हिंदी', sub: 'Hindi' },
  { code: 'english', label: 'English', sub: 'English' },
  { code: 'gujarati', label: 'ગુજરાતી', sub: 'Gujarati' },
  { code: 'other', label: '+ Other', sub: 'Other language' },
];

export default function LanguageSelect({ businessName, onSelect }: Props) {
  return (
    <div className="flex-1 flex flex-col px-6 pb-8 fade-in">
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-3xl font-bold text-gray-900 mb-2 text-center">
          नमस्ते! Hello! <br />કેમ છો?
        </p>
        <p className="text-center text-gray-500 text-sm mb-10">
          Choose the language you're most comfortable in
        </p>

        <div className="grid grid-cols-2 gap-3">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => onSelect(lang.code)}
              className="h-20 flex flex-col items-center justify-center gap-1 border-2 border-gray-100 rounded-2xl bg-white hover:border-green-500 hover:bg-green-50 active:scale-95 transition-all duration-150 shadow-sm"
            >
              <span className="text-2xl font-bold text-gray-900">{lang.label}</span>
              <span className="text-xs text-gray-400">{lang.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}