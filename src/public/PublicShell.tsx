import { useEffect, useState, type ReactNode } from 'react'
import { dirOf, languages, type Lang } from '../lib/i18n'

const LANG_KEY = 'handyman-public-lang'

/** The language the visitor picked last time (or their phone's, if it's Hebrew) */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY) as Lang | null
      if (saved && languages.some((l) => l.code === saved)) return saved
    } catch {
      // private browsing: just use the default
    }
    return typeof navigator !== 'undefined' && navigator.language?.startsWith('he') ? 'he' : 'en'
  })
  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // not saved: fine
    }
  }, [lang])
  return [lang, setLang]
}

/** The frame around every public page: business name and a language switch */
export function PublicShell({
  title,
  company,
  lang,
  onLang,
  children,
}: {
  title: string
  company?: string
  lang: Lang
  onLang?: (l: Lang) => void
  children: ReactNode
}) {
  useEffect(() => {
    document.title = company ? `${title} · ${company}` : title
  }, [title, company])
  return (
    <div dir={dirOf(lang)} lang={lang} className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+16px)]">
        <header className="mb-5 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {company && <p className="text-[13px] font-semibold uppercase tracking-wide text-brand">{company}</p>}
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
          </div>
          {onLang && (
            <div className="flex shrink-0 gap-1 rounded-full bg-hairline p-1" role="radiogroup" aria-label="Language">
              {languages.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={lang === l.code}
                  onClick={() => onLang(l.code)}
                  className={`min-h-9 rounded-full px-3 text-[14px] font-semibold ${lang === l.code ? 'bg-white shadow' : 'text-[#636366]'}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </header>
        {children}
      </div>
    </div>
  )
}
