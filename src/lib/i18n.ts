/**
 * Words on the public pages (request page, guides, status page) in English and
 * Hebrew. To add a language, add its code to `languages` and a column to every
 * entry below; any missing word falls back to English.
 */
export const languages = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'he', label: 'עברית', dir: 'rtl' },
] as const

export type Lang = (typeof languages)[number]['code']

export const dirOf = (lang: Lang) => languages.find((l) => l.code === lang)?.dir ?? 'ltr'

const words = {
  requestTitle: { en: 'Request a repair', he: 'בקשת תיקון' },
  requestIntro: { en: 'Tell us what needs fixing. It takes about two minutes.', he: 'ספרו לנו מה צריך לתקן. זה לוקח בערך שתי דקות.' },
  pageMissing: { en: "This request page doesn't exist. Please check the link.", he: 'דף הבקשות הזה לא קיים. בדקו את הקישור.' },
  address: { en: 'Address', he: 'כתובת' },
  addressHint: { en: 'Start typing, e.g. 12 Oak Street', he: 'התחילו להקליד, למשל 12 Oak Street' },
  continue: { en: 'Continue', he: 'המשך' },
  checking: { en: 'Checking…', he: 'בודק…' },
  onPlan: { en: 'This house is on our maintenance plan.', he: 'הבית הזה במסלול התחזוקה שלנו.' },
  whichUnit: { en: 'Which apartment?', he: 'איזו דירה?' },
  unitOther: { en: 'Other', he: 'אחר' },
  unitLabel: { en: 'Apartment or unit (optional)', he: 'דירה או יחידה (לא חובה)' },
  unitHint: { en: 'e.g. Apartment A, Basement, Upstairs', he: 'למשל דירה א׳, מרתף, קומה עליונה' },
  change: { en: 'Change', he: 'שינוי' },
  whatNeedsFixing: { en: 'What needs fixing?', he: 'מה צריך לתקן?' },
  pickAll: { en: 'Pick everything that applies.', he: 'בחרו את כל מה שמתאים.' },
  describeOther: { en: 'Describe the problem', he: 'תארו את הבעיה' },
  addPhoto: { en: 'Add a photo', he: 'הוספת תמונה' },
  photoRequired: { en: 'A photo is needed for each issue', he: 'צריך תמונה לכל בעיה' },
  photoOptionalEmergency: { en: 'Photos are optional for emergencies', he: 'בחירום התמונות לא חובה' },
  stickerPhoto: { en: 'Photo of the model sticker (optional)', he: 'תמונה של מדבקת הדגם (לא חובה)' },
  stickerHint: {
    en: 'Usually inside the door or on the back. It helps us bring the right part.',
    he: 'בדרך כלל בפנים הדלת או מאחור. זה עוזר לנו להביא את החלק הנכון.',
  },
  uploading: { en: 'Uploading…', he: 'מעלה…' },
  remove: { en: 'Remove', he: 'הסרה' },
  moreDetails: { en: 'Anything else we should know? (optional)', he: 'עוד משהו שכדאי שנדע? (לא חובה)' },
  punchList: { en: 'Have a list of things to fix?', he: 'יש לכם רשימה של דברים לתקן?' },
  punchListHint: { en: 'Paste it here, or add a screenshot of it.', he: 'הדביקו אותה כאן, או הוסיפו צילום מסך שלה.' },
  addScreenshot: { en: 'Add a screenshot', he: 'הוספת צילום מסך' },
  howUrgent: { en: 'How urgent is it?', he: 'כמה זה דחוף?' },
  emergency: { en: 'Emergency', he: 'חירום' },
  emergencyHint: { en: 'Water leaking, no heat, no power, unsafe', he: 'דליפת מים, אין חימום, אין חשמל, מסוכן' },
  soon: { en: 'Soon', he: 'בקרוב' },
  soonHint: { en: 'In the next few days', he: 'בימים הקרובים' },
  whenever: { en: 'Whenever', he: 'מתי שנוח' },
  wheneverHint: { en: 'At our next visit nearby', he: 'בביקור הבא שלנו באזור' },
  emergencyFee: { en: 'Emergency visits have a {fee} emergency charge.', he: 'לביקור חירום יש תוספת חירום של {fee}.' },
  callNow: { en: 'Call now', he: 'התקשרו עכשיו' },
  callNowHint: { en: 'For an emergency, please also call us right away.', he: 'במקרה חירום, התקשרו אלינו גם מיד.' },
  yourDetails: { en: 'Your details', he: 'הפרטים שלכם' },
  name: { en: 'Your name', he: 'השם שלכם' },
  phone: { en: 'Phone', he: 'טלפון' },
  iAm: { en: 'I am the', he: 'אני' },
  tenant: { en: 'Tenant', he: 'דייר/ת' },
  landlord: { en: 'Landlord', he: 'בעל/ת הבית' },
  other: { en: 'Other', he: 'אחר' },
  bestDays: { en: 'Best days for us to come', he: 'הימים הכי נוחים שנגיע' },
  bestHours: { en: 'Best hours', he: 'השעות הכי נוחות' },
  morning: { en: 'Morning', he: 'בוקר' },
  afternoon: { en: 'Afternoon', he: 'צהריים' },
  evening: { en: 'Evening', he: 'ערב' },
  anyTime: { en: 'Any time', he: 'כל שעה' },
  send: { en: 'Send request', he: 'שליחת הבקשה' },
  sending: { en: 'Sending…', he: 'שולח…' },
  needAddress: { en: 'Please enter the address first.', he: 'נא להזין קודם את הכתובת.' },
  needIssue: { en: 'Please pick at least one thing to fix.', he: 'נא לבחור לפחות דבר אחד לתיקון.' },
  needPhotos: { en: 'Please add a photo for each issue.', he: 'נא להוסיף תמונה לכל בעיה.' },
  needOther: { en: 'Please describe the problem.', he: 'נא לתאר את הבעיה.' },
  needContact: { en: 'Please enter your name and phone number.', he: 'נא להזין שם ומספר טלפון.' },
  thanksTitle: { en: 'Request received', he: 'הבקשה התקבלה' },
  thanksBody: { en: "Thanks! We'll text you to set a time.", he: 'תודה! נשלח לכם הודעה כדי לקבוע זמן.' },
  thanksEmergency: { en: "We've been alerted. If you haven't already, please call us now.", he: 'קיבלנו התראה. אם עוד לא התקשרתם, התקשרו אלינו עכשיו.' },
  statusLinkNote: { en: 'Save this link to see the status of your request:', he: 'שמרו את הקישור הזה כדי לראות את מצב הבקשה:' },
  openStatus: { en: 'See status', he: 'צפייה במצב' },
  planPitch: {
    en: 'Own this house? Our Landlord Maintenance Plan is {price}/month per house: {hours} hour of handyman work every {months} months, and unused hours roll over.',
    he: 'הבית שלכם? מסלול התחזוקה לבעלי בתים עולה {price} לחודש לבית: שעה של עבודה כל {months} חודשים, ושעות שלא נוצלו נשמרות.',
  },
  newRequest: { en: 'Send another request', he: 'שליחת בקשה נוספת' },
  statusTitle: { en: 'Your request', he: 'הבקשה שלכם' },
  received: { en: 'Received', he: 'התקבלה' },
  scheduled: { en: 'Scheduled', he: 'נקבע מועד' },
  done: { en: 'Done', he: 'בוצע' },
  closed: { en: 'Closed', he: 'נסגרה' },
  sentOn: { en: 'Sent {date}', he: 'נשלחה {date}' },
  statusMissing: { en: "This link doesn't work any more. Please call us.", he: 'הקישור הזה כבר לא פעיל. התקשרו אלינו.' },
  howDidWeDo: { en: 'How did we do?', he: 'איך היה?' },
  thumbsUp: { en: 'Good', he: 'טוב' },
  thumbsDown: { en: 'Not good', he: 'לא טוב' },
  reviewAsk: { en: 'Thank you! Would you leave us a quick Google review?', he: 'תודה! תוכלו להשאיר לנו ביקורת קצרה בגוגל?' },
  leaveReview: { en: 'Leave a review', he: 'כתיבת ביקורת' },
  sorryAsk: { en: "We're sorry. What went wrong? Only we will see this.", he: 'אנחנו מצטערים. מה השתבש? רק אנחנו נראה את זה.' },
  sendNote: { en: 'Send', he: 'שליחה' },
  thanksFeedback: { en: 'Thanks for telling us.', he: 'תודה שסיפרתם לנו.' },
  callUs: { en: 'Call us', he: 'התקשרו אלינו' },
  tryThisFirst: { en: 'Try this first', he: 'נסו קודם את זה' },
  fixedIt: { en: 'That fixed it', he: 'זה תיקן' },
  stillBroken: { en: 'Still not working: send a request', he: 'עדיין לא עובד: שליחת בקשה' },
  yes: { en: 'Yes', he: 'כן' },
  no: { en: 'No', he: 'לא' },
  next: { en: 'Next', he: 'הבא' },
  back: { en: 'Back', he: 'חזרה' },
  glad: { en: "Great, glad it's working! Nothing else to do.", he: 'מעולה, שמחים שזה עובד! אין צורך בעוד משהו.' },
  callForHelp: { en: 'Call for help', he: 'התקשרו לעזרה' },
  videoCall: { en: 'Video call', he: 'שיחת וידאו' },
  skipGuide: { en: 'Skip, just send the request', he: 'דלגו, רק לשלוח בקשה' },
  triedSteps: { en: 'Tried the guide', he: 'ניסו את המדריך' },
} satisfies Record<string, Record<'en', string> & Partial<Record<Lang, string>>>

export type WordKey = keyof typeof words

/** A word in this language, with {placeholders} filled in */
export function t(lang: Lang, key: WordKey, vars: Record<string, string | number> = {}): string {
  const entry = words[key] as Partial<Record<Lang, string>> & { en: string }
  let text = entry[lang] ?? entry.en
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v))
  return text
}

/** The quick picks on the request page */
export const quickPicks: { key: string; en: string; he: string; appliance?: boolean }[] = [
  { key: 'unclog', en: 'Unclog a sink, tub or shower', he: 'פתיחת סתימה בכיור, אמבטיה או מקלחת' },
  { key: 'igniter', en: "Stove or oven won't light", he: 'הכיריים או התנור לא נדלקים', appliance: true },
  { key: 'filter', en: 'Change the heating / AC filter', he: 'החלפת פילטר מזגן / חימום' },
  { key: 'door', en: 'Door knob or lock', he: 'ידית דלת או מנעול' },
  { key: 'cabinet', en: 'Cabinet or drawer', he: 'ארון או מגירה' },
  { key: 'faucet', en: 'Leaking faucet or small plumbing', he: 'ברז מטפטף או אינסטלציה קלה' },
  { key: 'small', en: 'Other small repair', he: 'תיקון קטן אחר' },
  { key: 'other', en: 'Something else (describe it)', he: 'משהו אחר (תארו)' },
]

export const pickLabel = (key: string, lang: Lang = 'en') => {
  const p = quickPicks.find((q) => q.key === key)
  return p ? (lang === 'he' ? p.he : p.en) : key
}

export const weekdays: { key: string; en: string; he: string }[] = [
  { key: 'Sun', en: 'Sun', he: 'א׳' },
  { key: 'Mon', en: 'Mon', he: 'ב׳' },
  { key: 'Tue', en: 'Tue', he: 'ג׳' },
  { key: 'Wed', en: 'Wed', he: 'ד׳' },
  { key: 'Thu', en: 'Thu', he: 'ה׳' },
  { key: 'Fri', en: 'Fri', he: 'ו׳' },
]
