import { create } from 'zustand';

type Lang = 'en' | 'hi';

const en = {
  builder: { title: 'Paper Builder', publish: 'Publish Exam', search: 'Search...', newQuestion: 'New' },
  exam: { begin: 'BEGIN EXAM', submit: 'Submit', prev: 'Prev', next: 'Next', getReady: 'Get Ready' },
  dashboard: { missionControl: 'Mission Control', search: 'Search by name...', flagged: 'Flagged', endExam: 'End Exam', downloadReports: 'Download Reports' },
  student: { joinExam: 'Join Exam', yourName: 'Your Display Name', join: 'Join Exam', checking: 'Checking...' },
  common: { back: 'Back', cancel: 'Cancel', confirm: 'Confirm', download: 'Download', retake: 'Retake' },
};

const hi: typeof en = {
  builder: { title: 'प्रश्न-पत्र निर्माता', publish: 'परीक्षा प्रकाशित करें', search: 'खोजें...', newQuestion: 'नया' },
  exam: { begin: 'परीक्षा शुरू करें', submit: 'जमा करें', prev: 'पिछला', next: 'अगला', getReady: 'तैयार हो जाइए' },
  dashboard: { missionControl: 'नियंत्रण कक्ष', search: 'नाम से खोजें...', flagged: 'चिह्नित', endExam: 'परीक्षा समाप्त करें', downloadReports: 'रिपोर्ट डाउनलोड करें' },
  student: { joinExam: 'परीक्षा में शामिल हों', yourName: 'आपका नाम', join: 'शामिल हों', checking: 'जांच हो रही है...' },
  common: { back: 'वापस', cancel: 'रद्द करें', confirm: 'पुष्टि करें', download: 'डाउनलोड', retake: 'पुनः प्रयास' },
};

export const useLang = create<{ lang: Lang; t: typeof en; setLang: (l: Lang) => void }>((set) => ({
  lang: 'en',
  t: en,
  setLang: (l: Lang) => set({ lang: l, t: l === 'hi' ? hi : en }),
}));

export type Translation = typeof en;
