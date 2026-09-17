import { Question } from '@/types';

export const RESTAURANT_QUESTIONS: Question[] = [
  {
    id: 'r1',
    text_en: 'What brought you in today?',
    text_hi: 'आज आप यहाँ किस अवसर पर आए?',
    text_gu: 'આજे તমे અहीं શा माटे આव્याd?',
    input_type: 'chips',
    options: [
      { en: 'Lunch', hi: 'दोपहर का खाना', gu: 'બपोरनुं ભोजन' },
      { en: 'Dinner', hi: 'रात का खाना', gu: 'રात्रि ભोजन' },
      { en: 'Breakfast', hi: 'नाश्ता', gu: 'નास्तो' },
      { en: 'Quick Snack', hi: 'हल्का नाश्ता', gu: 'ઝડपी નास्तो' },
      { en: 'Special Occasion', hi: 'खास मौका', gu: 'ખास પ्रसंग' },
    ],
    enabled: true,
  },
  {
    id: 'r2',
    text_en: 'What did you eat? 🍽️',
    text_hi: 'आपने क्या खाया? 🍽️',
    text_gu: 'તमे शुं ખाध्युं? 🍽️',
    input_type: 'text',
    enabled: true,
  },
  {
    id: 'r3',
    text_en: 'How was the taste?',
    text_hi: 'खाने का स्वाद कैसा था?',
    text_gu: 'ખोराकनो સ्वाद केवो हतो?',
    input_type: 'emoji_slider',
    enabled: true,
  },
  {
    id: 'r4',
    text_en: 'How was the service speed?',
    text_hi: 'सर्विस कितनी तेज़ थी?',
    text_gu: 'સेवा केटली ઝડपी हती?',
    input_type: 'chips',
    options: [
      { en: 'Very Fast', hi: 'बहुत तेज़', gu: 'ખूब ઝડपी' },
      { en: 'Just Right', hi: 'बिल्कुल सही', gu: 'એकदम સारी' },
      { en: 'A Bit Slow', hi: 'थोड़ा धीमा', gu: 'થोडी धीमी' },
    ],
    enabled: true,
  },
  {
    id: 'r5',
    text_en: 'One word that describes your visit?',
    text_hi: 'एक शब्द में आपकी visit कैसी रही?',
    text_gu: 'એक શब्दमां तमारी मुलाकात केवी रही?',
    input_type: 'text',
    enabled: true,
  },
];

export const CAFE_QUESTIONS: Question[] = [
  {
    id: 'c1',
    text_en: 'What did you order?',
    text_hi: 'आपने क्या order किया?',
    text_gu: 'તमे शुं ઓर्डर कर्युं?',
    input_type: 'chips',
    options: [
      { en: 'Coffee', hi: 'कॉफ़ी', gu: 'કॉफी' },
      { en: 'Tea', hi: 'चाय', gu: 'ચा' },
      { en: 'Cold Drink', hi: 'ठंडा पेय', gu: 'ઠंडुं પीणुं' },
      { en: 'Snack', hi: 'स्नैक', gu: 'સ્નૅक' },
      { en: 'Meal', hi: 'खाना', gu: 'ભोजन' },
    ],
    enabled: true,
  },
  {
    id: 'c2',
    text_en: 'What was the vibe for you?',
    text_hi: 'आपके लिए यहाँ का माहौल कैसा था?',
    text_gu: 'તमारा माटे अहींनो माहोल केवो हतो?',
    input_type: 'chips',
    options: [
      { en: 'Study Spot', hi: 'पढ़ाई की जगह', gu: 'અभ्यास स्थळ' },
      { en: 'Chill with Friends', hi: 'दोस्तों के साथ', gu: 'मित्रो साथे' },
      { en: 'Date Spot', hi: 'डेट के लिए', gu: 'ડेट સ્પૉट' },
      { en: 'Quick Break', hi: 'छोटा ब्रेक', gu: 'ઝडपी विराम' },
    ],
    enabled: true,
  },
  {
    id: 'c3',
    text_en: 'Overall experience?',
    text_hi: 'कुल मिलाकर अनुभव?',
    text_gu: 'એकंदर અनुभव?',
    input_type: 'emoji_slider',
    enabled: true,
  },
  {
    id: 'c4',
    text_en: "Anything you'd come back for?",
    text_hi: 'क्या ऐसा कुछ है जिसके लिए आप दोबारा आएंगे?',
    text_gu: 'શुं कोई वस्तु छे जेना माटे तमे फरी आवशो?',
    input_type: 'text',
    enabled: true,
  },
];

export const CLINIC_QUESTIONS: Question[] = [
  {
    id: 'cl1',
    text_en: 'What type of visit was this?',
    text_hi: 'यह किस प्रकार की विजिट थी?',
    text_gu: 'आ कई प्रकारनी मुलाकात हती?',
    input_type: 'chips',
    options: [
      { en: 'General Consultation', hi: 'सामान्य परामर्श', gu: 'સामान्य परामर्श' },
      { en: 'Dental', hi: 'दंत चिकित्सा', gu: 'દांतनी सारवार' },
      { en: 'Eye Check', hi: 'आँखों की जाँच', gu: 'આंखनी तपास' },
      { en: 'Physio', hi: 'फिजियोथेरेपी', gu: 'ફिझिओ' },
      { en: 'Other', hi: 'अन्य', gu: 'અन्य' },
    ],
    enabled: true,
  },
  {
    id: 'cl2',
    text_en: 'How was the wait time?',
    text_hi: 'प्रतीक्षा का समय कैसा था?',
    text_gu: 'राह जोवानो समय केवो हतो?',
    input_type: 'chips',
    options: [
      { en: 'Very Short', hi: 'बहुत कम', gu: 'ખूब ઓछो' },
      { en: 'Reasonable', hi: 'उचित', gu: 'વ्याजबी' },
      { en: 'A Bit Long', hi: 'थोड़ा लंबा', gu: 'થोडो લांबो' },
    ],
    enabled: true,
  },
  {
    id: 'cl3',
    text_en: 'How did the staff make you feel?',
    text_hi: 'स्टाफ ने आपको कैसा महसूस कराया?',
    text_gu: 'સ्टाफ द्वारा तमे केवुं अनुभव्युं?',
    input_type: 'emoji_slider',
    enabled: true,
  },
  {
    id: 'cl4',
    text_en: 'Why would you recommend this clinic?',
    text_hi: 'आप इस क्लिनिक को क्यों recommend करेंगे?',
    text_gu: 'તमे आ क्लिनिकने शा माटे भलामण करशो?',
    input_type: 'text',
    enabled: true,
  },
];

export const SALON_QUESTIONS: Question[] = [
  {
    id: 's1',
    text_en: 'What service did you get?',
    text_hi: 'आपने कौन सी सर्विस ली?',
    text_gu: 'તमे कई सेवा लीधी?',
    input_type: 'chips',
    options: [
      { en: 'Haircut', hi: 'बाल कटवाना', gu: 'વाळ काप' },
      { en: 'Colour', hi: 'कलर', gu: 'કलर' },
      { en: 'Facial', hi: 'फेशियल', gu: 'ફेशियल' },
      { en: 'Waxing', hi: 'वैक्सिंग', gu: 'વૅक्सिंग' },
      { en: 'Full Package', hi: 'पूरा पैकेज', gu: 'ફुल પૅकेज' },
    ],
    enabled: true,
  },
  {
    id: 's2',
    text_en: 'How happy are you with the result?',
    text_hi: 'आप परिणाम से कितने खुश हैं?',
    text_gu: 'તमे परिणाम साथे केटला ખुश छो?',
    input_type: 'emoji_slider',
    enabled: true,
  },
  {
    id: 's3',
    text_en: 'How was the staff?',
    text_hi: 'स्टाफ कैसा था?',
    text_gu: 'સ्टाफ केवो हतो?',
    input_type: 'chips',
    options: [
      { en: 'Friendly', hi: 'मिलनसार', gu: 'મૈत्रीपूर्ण' },
      { en: 'Professional', hi: 'प्रोफेशनल', gu: 'વ્યવसायिक' },
      { en: 'Attentive', hi: 'ध्यानपूर्वक', gu: 'ધ्यानी' },
      { en: 'All of the above', hi: 'सभी', gu: 'બधुं ज' },
    ],
    enabled: true,
  },
  {
    id: 's4',
    text_en: 'How do you feel walking out?',
    text_hi: 'बाहर निकलते समय आप कैसा महसूस कर रहे हैं?',
    text_gu: 'બहार निकळ्या त्यारे तमने केवुं लाग्युं?',
    input_type: 'text',
    enabled: true,
  },
];

export const OTHER_QUESTIONS: Question[] = [
  {
    id: 'o1',
    text_en: 'What did you come in for?',
    text_hi: 'आप किस काम से आए थे?',
    text_gu: 'તमे शा माटे आव्या हता?',
    input_type: 'text',
    enabled: true,
  },
  {
    id: 'o2',
    text_en: 'Overall experience?',
    text_hi: 'कुल मिलाकर अनुभव?',
    text_gu: 'એकंदर અनुभव?',
    input_type: 'emoji_slider',
    enabled: true,
  },
  {
    id: 'o3',
    text_en: 'How was the staff?',
    text_hi: 'स्टाफ कैसा था?',
    text_gu: 'સ्टाफ केवो हतो?',
    input_type: 'chips',
    options: [
      { en: 'Very Helpful', hi: 'बहुत मददगार', gu: 'ખूब मददगार' },
      { en: 'Professional', hi: 'प्रोफेशनल', gu: 'વ્યવसायिक' },
      { en: 'Friendly', hi: 'मिलनसार', gu: 'મૈत्रीपूर्ण' },
    ],
    enabled: true,
  },
  {
    id: 'o4',
    text_en: "What's one reason you'd return?",
    text_hi: 'एक कारण बताएं जिसके लिए आप वापस आएंगे?',
    text_gu: 'એक कारण जेना माटे तमे फरी आवशो?',
    input_type: 'text',
    enabled: true,
  },
];

export function getQuestions(type: string): Question[] {
  switch (type) {
    case 'restaurant': return RESTAURANT_QUESTIONS;
    case 'cafe': return CAFE_QUESTIONS;
    case 'clinic': return CLINIC_QUESTIONS;
    case 'salon': return SALON_QUESTIONS;
    default: return OTHER_QUESTIONS;
  }
}

export function getQuestionText(q: Question, lang: string): string {
  if (lang === 'hindi') return q.text_hi;
  if (lang === 'gujarati') return q.text_gu;
  return q.text_en;
}

export function getOptionText(
  opt: { en: string; hi: string; gu: string },
  lang: string
): string {
  if (lang === 'hindi') return opt.hi;
  if (lang === 'gujarati') return opt.gu;
  return opt.en;
}