export type BusinessType = 'restaurant' | 'cafe' | 'clinic' | 'salon' | 'other';
export type Language = 'hindi' | 'english' | 'gujarati' | 'other';

export interface Business {
  id: string;
  name: string;
  type: BusinessType;
  google_review_url: string;
  owner_email: string;
  slug: string;
  logo_url: string | null;
  custom_questions: CustomQuestion[] | null;
  created_at: string;
}

export interface CustomQuestion {
  id: string;
  text_en: string;
  text_hi: string;
  text_gu: string;
  input_type: 'text' | 'chips' | 'emoji_slider';
  options?: string[];
  enabled: boolean;
}

export interface ReviewSession {
  id: string;
  business_id: string;
  language: string;
  answers: QA[];
  generated_review: string;
  star_rating: number;
  posted: boolean;
  created_at: string;
}

export interface QA {
  question: string;
  answer: string;
}

export interface Question {
  id: string;
  text_en: string;
  text_hi: string;
  text_gu: string;
  input_type: 'chips' | 'emoji_slider' | 'text' | 'multi_select';
  options?: { en: string; hi: string; gu: string }[];
  enabled: boolean;
}