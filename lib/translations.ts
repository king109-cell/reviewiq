export type Lang = 'english' | 'hindi' | 'gujarati' | 'other';

export const t = (lang: Lang) => ({
  greeting: {
    english: "How was your experience?",
    hindi: "आपका अनुभव कैसा था?",
    gujarati: "તમારો અનુભવ કેવો હતો?",
    other: "How was your experience?",
  }[lang],

  next: {
    english: "Next",
    hindi: "आगे",
    gujarati: "આગળ",
    other: "Next",
  }[lang],

  generating_1: {
    english: "Reading your answers...",
    hindi: "आपके जवाब पढ़ रहे हैं...",
    gujarati: "તમારા જવાબ વાંચી રહ્યા છીએ...",
    other: "Reading your answers...",
  }[lang],

  generating_2: {
    english: "Writing your review...",
    hindi: "आपकी समीक्षा लिख रहे हैं...",
    gujarati: "તમારી સमीक્ષા લખी રહ્યા છીએ...",
    other: "Writing your review...",
  }[lang],

  generating_3: {
    english: "Making it sound like you...",
    hindi: "इसे आप जैसा बना रहे हैं...",
    gujarati: "તમારા જેવું બनावी રह્યા છীએ...",
    other: "Making it sound like you...",
  }[lang],

  review_ready: {
    english: "Your Review is Ready!",
    hindi: "आपकी समीक्षा तैयार है!",
    gujarati: "તમારી સमीक्षा તૈयार છे!",
    other: "Your Review is Ready!",
  }[lang],

  post_to_google: {
    english: "Post to Google →",
    hindi: "Google पर पोस्ट करें →",
    gujarati: "Google પर પોস્ट કरો →",
    other: "Post to Google →",
  }[lang],

  edit: {
    english: "✏ Edit",
    hindi: "✏ संपादित करें",
    gujarati: "✏ સંपादित કरો",
    other: "✏ Edit",
  }[lang],

  try_again: {
    english: "🔄 Try again",
    hindi: "🔄 फिर से कोशिश करें",
    gujarati: "🔄 ફરી પ્રयास કरो",
    other: "🔄 Try again",
  }[lang],

  paste_overlay: {
    english: "Paste into Google → Hit Post ⭐",
    hindi: "Google में Paste करें → Post दबाएं ⭐",
    gujarati: "Google માં Paste કरो → Post દबावो ⭐",
    other: "Paste into Google → Hit Post ⭐",
  }[lang],

  thank_you: {
    english: "Thank you! You're amazing. 🌟",
    hindi: "धन्यवाद! आप बहुत अच्छे हैं। 🌟",
    gujarati: "આभार! તમे અદ્ભुत છો. 🌟",
    other: "Thank you! You're amazing. 🌟",
  }[lang],

  thank_you_sub: {
    english: "Your review helps others find great places.",
    hindi: "आपकी समीक्षा दूसरों को अच्छी जगहें खोजने में मदद करती है।",
    gujarati: "તમારी સमीक्षा અन્ય લોकોને સारी જग्याઓ શोधवामां મदद કरे છे.",
    other: "Your review helps others find great places.",
  }[lang],

  error_generate: {
    english: "We had a small hiccup. Tap to try again.",
    hindi: "कुछ गड़बड़ हो गई। दोबारा कोशिश करें।",
    gujarati: "કंઈ ખોटું થઈ ગयું. ફरी પ્રयास કरो.",
    other: "We had a small hiccup. Tap to try again.",
  }[lang],

  select_language: {
    english: "Choose your language",
    hindi: "अपनी भाषा चुनें",
    gujarati: "તमारी ભाषા પसंद કरो",
    other: "Choose your language",
  }[lang],

  stars: {
    english: "Rate your experience",
    hindi: "अपना अनुभव रेट करें",
    gujarati: "તमारो અनुभव રेट કरो",
    other: "Rate your experience",
  }[lang],
});