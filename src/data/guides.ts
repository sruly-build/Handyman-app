import type { GuideStep, Localized } from './types'

/**
 * Starter troubleshooting guides: safe checks a tenant can try before a
 * visit. These are only drafts. Nothing shows on the request page until the
 * owner reads, edits and publishes each one (Me → Request page → Guides).
 */
export interface StarterGuide {
  issue_key: string
  title: Localized
  steps: GuideStep[]
}

const s = (en: string, he: string, tipEn?: string, tipHe?: string): GuideStep => ({
  q: { en, he },
  ...(tipEn ? { tip: { en: tipEn, he: tipHe ?? '' } } : {}),
})

export const starterGuides: StarterGuide[] = [
  {
    issue_key: 'unclog',
    title: { en: 'Slow or clogged drain', he: 'ניקוז איטי או סתום' },
    steps: [
      s(
        'Run hot tap water for about a minute. Does it start to drain?',
        'הזרימו מים חמים מהברז כדקה. האם זה מתחיל לרדת?',
        "Please don't use chemical drain cleaners: they can burn skin and damage pipes.",
        'נא לא להשתמש בחומרים כימיים לפתיחת סתימות: הם עלולים לגרום לכוויות ולפגוע בצנרת.',
      ),
      s(
        'Pull out the stopper and clean off any hair or gunk, then try again.',
        'הוציאו את הפקק ונקו שערות ולכלוך, ואז נסו שוב.',
      ),
      s(
        'Try a plunger: cover the overflow hole with a wet cloth, then plunge firmly 10 to 15 times.',
        'נסו פומפה: כסו את חור הגלישה במטלית רטובה, ואז לחצו בחוזקה 10 עד 15 פעמים.',
      ),
    ],
  },
  {
    issue_key: 'igniter',
    title: { en: "Stove or oven won't light", he: 'הכיריים או התנור לא נדלקים' },
    steps: [
      s(
        'Push the knob in and turn it to LITE. Do you hear clicking?',
        'לחצו על הכפתור וסובבו למצב הדלקה. האם שומעים תקתוק?',
        'If you smell gas, turn everything off, leave the home, and call the gas company from outside.',
        'אם מריחים גז, כבו הכול, צאו מהבית והתקשרו לחברת הגז מבחוץ.',
      ),
      s(
        'Is the burner cap sitting flat and dry? Wipe off spills, set it back straight, and let it dry for an hour.',
        'האם מכסה המבער יושב ישר ויבש? נגבו שפיכות, החזירו אותו ישר ותנו לו להתייבש כשעה.',
      ),
      s(
        'Is the stove plugged in and its breaker on? Gas stoves still need power to click.',
        'האם הכיריים מחוברות לחשמל והמפסק דולק? גם כיריים גז צריכות חשמל כדי לתקתק.',
      ),
    ],
  },
  {
    issue_key: 'filter',
    title: { en: 'Changing the heating / AC filter', he: 'החלפת פילטר מזגן / חימום' },
    steps: [
      s(
        'Turn the system off at the thermostat. Slide out the old filter and read the size printed on its edge.',
        'כבו את המערכת בתרמוסטט. הוציאו את הפילטר הישן וקראו את המידה המודפסת על הצד.',
      ),
      s(
        'Slide in a new filter of the same size with the arrow pointing toward the unit, then turn the system back on.',
        'הכניסו פילטר חדש באותה מידה כשהחץ מצביע לכיוון היחידה, ואז הדליקו שוב את המערכת.',
      ),
    ],
  },
  {
    issue_key: 'door',
    title: { en: 'Door knob or lock', he: 'ידית דלת או מנעול' },
    steps: [
      s('Are the screws on the knob or its plate loose? Tighten them with a screwdriver.', 'האם הברגים בידית או בלוחית רופפים? הדקו אותם עם מברג.'),
      s(
        'Does the latch stick? Spray a little lubricant (like WD-40) into the latch and turn the knob a few times.',
        'האם הלשונית נתקעת? רססו מעט שמן סיכה (כמו WD-40) לתוך הלשונית וסובבו את הידית כמה פעמים.',
      ),
    ],
  },
  {
    issue_key: 'cabinet',
    title: { en: 'Cabinet or drawer', he: 'ארון או מגירה' },
    steps: [
      s('Are the hinge screws loose? Tighten them with a screwdriver.', 'האם ברגי הצירים רופפים? הדקו אותם עם מברג.'),
      s(
        'For a drawer: empty it and check nothing is stuck in the slides at the back.',
        'במגירה: רוקנו אותה ובדקו ששום דבר לא תקוע במסילות מאחור.',
      ),
    ],
  },
  {
    issue_key: 'faucet',
    title: { en: 'Leaking faucet', he: 'ברז מטפטף' },
    steps: [
      s(
        'Turn the handle firmly all the way to off. Does the drip stop?',
        'סובבו את הידית בחוזקה עד הסוף לסגירה. האם הטפטוף נעצר?',
        'For a big leak, turn the small valves under the sink to the right (clockwise) to shut off the water.',
        'בדליפה גדולה, סובבו את הברזים הקטנים מתחת לכיור ימינה (עם כיוון השעון) כדי לסגור את המים.',
      ),
      s('Is the tip of the faucet (the aerator) loose? Tighten it by hand.', 'האם קצה הברז (החסכם) רופף? הדקו אותו ביד.'),
    ],
  },
]

/** The guide text in the visitor's language (English when not translated) */
export const say = (text: Localized | undefined, lang: string) =>
  !text ? '' : (lang === 'he' && text.he?.trim() ? text.he : text.en)
