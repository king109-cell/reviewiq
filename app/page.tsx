import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <span className="text-xl font-bold text-green-600">ReviewIQ</span>
        <div className="flex gap-4">
          <Link href="/onboard" className="text-sm text-gray-600 hover:text-gray-900">
            Sign In
          </Link>
          <Link
            href="/onboard"
            className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="inline-block bg-green-50 text-green-700 text-sm font-medium px-4 py-2 rounded-full mb-6">
          Trusted by 500+ local businesses
        </div>
        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          Turn every customer into<br />
          <span className="text-green-600">a 5-star reviewer</span>
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
          Customers scan a QR code, answer 4 quick questions, and get a genuine,
          personalised Google review generated instantly — in their language.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/onboard"
            className="bg-green-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-green-700 transition-colors"
          >
            Start free — no credit card
          </Link>
          <Link
            href="/r/demo"
            className="border border-gray-200 text-gray-700 px-8 py-4 rounded-xl text-lg font-semibold hover:border-gray-300 transition-colors"
          >
            See demo →
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: '⚡',
              title: '30-second flow',
              desc: 'No boring forms. A friendly chat that takes 30 seconds on any phone.',
            },
            {
              icon: '🌐',
              title: '3 languages',
              desc: 'Hindi, Gujarati, English — your customers write in the language they think in.',
            },
            {
              icon: '🤖',
              title: 'Never the same review twice',
              desc: 'Every review is unique, specific, and sounds like it was actually written by that person.',
            },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-8 text-sm text-gray-400">
        © 2024 ReviewIQ · Built for local businesses that deserve more stars.
      </footer>
    </main>
  );
}