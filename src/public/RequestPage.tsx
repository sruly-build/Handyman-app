import { useQuery } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { AddressField } from '../components/AddressField'
import { CameraIcon, CheckIcon, CloseIcon, PhoneIcon } from '../components/Icons'
import { Button, Card, Divider, ErrorNote, Field, Loading, TextArea } from '../components/ui'
import { publicApi } from '../data/backend'
import { newUploadKey, type AddressCheck, type RequestPayload, type SubmitResult } from '../data/publicApi'
import { money } from '../data/requests'
import type { Urgency } from '../data/types'
import { geocode } from '../lib/addresses'
import { t, quickPicks, weekdays, type Lang } from '../lib/i18n'
import { shrinkPhoto } from '../lib/images'
import { phoneLink } from '../lib/links'
import { GuideSheet } from './GuideSheet'
import { PublicShell, useLang } from './PublicShell'

interface Photo {
  id: string
  url: string
  path: string | null
  error?: string
}

interface Picked {
  key: string
  text: string
  tried: string[]
  photos: Photo[]
  stickers: Photo[]
}

const chip = (active: boolean) =>
  `min-h-11 rounded-full px-4 text-[15px] font-semibold transition ${active ? 'bg-brand text-white' : 'bg-card text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:opacity-60'}`

/** The public request page: /r/<company> — no login */
export function RequestPage() {
  const { slug = '' } = useParams()
  const [lang, setLang] = useLang()
  const { data: page, isLoading, error } = useQuery({
    queryKey: ['public-page', slug],
    queryFn: () => publicApi.page(slug),
    retry: false,
  })

  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(lang, key, vars)
  if (isLoading) return <PublicShell title={tr('requestTitle')} lang={lang} onLang={setLang}><Loading /></PublicShell>
  if (error || !page) {
    return (
      <PublicShell title={tr('requestTitle')} lang={lang} onLang={setLang}>
        {error ? <ErrorNote error={error} /> : <p className="text-[17px]">{tr('pageMissing')}</p>}
      </PublicShell>
    )
  }
  return (
    <PublicShell title={tr('requestTitle')} company={page.name} lang={lang} onLang={setLang}>
      <RequestForm slug={slug} lang={lang} page={page} />
    </PublicShell>
  )
}

type PageInfo = NonNullable<Awaited<ReturnType<typeof publicApi.page>>>

function RequestForm({ slug, lang, page }: { slug: string; lang: Lang; page: PageInfo }) {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(lang, key, vars)
  const startedAt = useRef(Date.now())
  const uploadKey = useRef(newUploadKey())
  const [hp, setHp] = useState('')

  const [address, setAddress] = useState('')
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(null)
  const [check, setCheck] = useState<AddressCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [unit, setUnit] = useState('')
  const [unitOther, setUnitOther] = useState(false)

  const [picked, setPicked] = useState<Picked[]>([])
  const [description, setDescription] = useState('')
  const [punchList, setPunchList] = useState('')
  const [listPhotos, setListPhotos] = useState<Photo[]>([])
  const [urgency, setUrgency] = useState<Urgency>('soon')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [kind, setKind] = useState<RequestPayload['kind']>('tenant')
  const [days, setDays] = useState<string[]>([])
  const [hours, setHours] = useState('')

  const [problem, setProblem] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<unknown>(null)
  const [done, setDone] = useState<SubmitResult | null>(null)
  // "Try this first" guides (published by the owner)
  const [guideKey, setGuideKey] = useState<string | null>(null)
  const [fixedNote, setFixedNote] = useState(false)
  const guideFor = (key: string) => page.guides.find((g) => g.issue_key === key && g.steps.length > 0)

  async function checkAddress(addr = address) {
    if (addr.trim().length < 5) {
      setProblem(tr('needAddress'))
      return
    }
    setProblem(null)
    setChecking(true)
    try {
      const [result, where] = await Promise.all([publicApi.checkAddress(slug, addr), geocode(addr)])
      setCheck(result)
      setSpot(where)
      setUnit('')
      setUnitOther(result.units.length === 0)
    } catch (e) {
      setSendError(e)
    } finally {
      setChecking(false)
    }
  }

  async function addPhotos(files: FileList | null, add: (p: Photo) => void, update: (id: string, patch: Partial<Photo>) => void) {
    for (const file of Array.from(files ?? []).slice(0, 6)) {
      const id = crypto.randomUUID()
      add({ id, url: URL.createObjectURL(file), path: null })
      try {
        const blob = await shrinkPhoto(file)
        update(id, { path: await publicApi.uploadPhoto(uploadKey.current, blob) })
      } catch (e) {
        update(id, { error: e instanceof Error ? e.message : 'Upload failed' })
      }
    }
  }
  const setPick = (key: string, patch: (p: Picked) => Picked) =>
    setPicked((list) => list.map((p) => (p.key === key ? patch(p) : p)))
  const photoHandlers = (key: string, field: 'photos' | 'stickers') => ({
    add: (ph: Photo) => setPick(key, (p) => ({ ...p, [field]: [...p[field], ph] })),
    update: (id: string, patch: Partial<Photo>) =>
      setPick(key, (p) => ({ ...p, [field]: p[field].map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
    remove: (id: string) => setPick(key, (p) => ({ ...p, [field]: p[field].filter((x) => x.id !== id) })),
  })

  function togglePick(key: string) {
    setFixedNote(false)
    // A guide opens first, so they can try the safe checks before sending
    if (!picked.some((p) => p.key === key) && guideFor(key)) setGuideKey(key)
    setPicked((list) =>
      list.some((p) => p.key === key)
        ? list.filter((p) => p.key !== key)
        : [...list, { key, text: '', tried: [], photos: [], stickers: [] }],
    )
  }

  async function send() {
    setProblem(null)
    setSendError(null)
    if (!check) return setProblem(tr('needAddress'))
    if (picked.length === 0 && !punchList.trim() && listPhotos.length === 0) return setProblem(tr('needIssue'))
    if (picked.some((p) => p.key === 'other' && !p.text.trim())) return setProblem(tr('needOther'))
    if (urgency !== 'emergency' && picked.some((p) => !p.photos.some((ph) => ph.path))) return setProblem(tr('needPhotos'))
    if (!name.trim() || phone.replace(/\D/g, '').length < 10) return setProblem(tr('needContact'))
    const uploading = [...picked.flatMap((p) => [...p.photos, ...p.stickers]), ...listPhotos].some((ph) => !ph.path && !ph.error)
    if (uploading) return setProblem(tr('uploading'))

    const photos: RequestPayload['photos'] = []
    picked.forEach((p, i) => {
      p.photos.forEach((ph) => ph.path && photos.push({ path: ph.path, kind: 'issue', issue: i }))
      p.stickers.forEach((ph) => ph.path && photos.push({ path: ph.path, kind: 'sticker', issue: i }))
    })
    listPhotos.forEach((ph) => ph.path && photos.push({ path: ph.path, kind: 'list', issue: null }))
    const payload: RequestPayload = {
      hp,
      elapsed_ms: Date.now() - startedAt.current,
      address: address.trim(),
      unit: unit.trim(),
      lat: spot?.lat ?? null,
      lng: spot?.lng ?? null,
      name: name.trim(),
      phone: phone.trim(),
      email: '',
      kind,
      issues: picked.map((p) => {
        const pick = quickPicks.find((q) => q.key === p.key)
        return { key: p.key, label: p.key === 'other' ? '' : (pick?.en ?? p.key), text: p.text.trim(), tried: p.tried }
      }),
      description: description.trim(),
      language: lang,
      urgency,
      best_days: days,
      best_hours: hours,
      punch_list: punchList.trim(),
      upload_key: uploadKey.current,
      photos,
    }
    setSending(true)
    try {
      const result = await publicApi.submit(slug, payload)
      if (result.token) void publicApi.notify(result.token)
      setDone(result)
      window.scrollTo({ top: 0 })
    } catch (e) {
      setSendError(e)
    } finally {
      setSending(false)
    }
  }

  if (done) return <Thanks lang={lang} page={page} result={done} />

  const callNumber = page.emergency_phone || page.phone

  return (
    <div className="space-y-6">
      <p className="text-[17px] text-muted">{tr('requestIntro')}</p>

      {/* Spam trap: hidden from people, bots fill it in */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
        aria-hidden="true"
      />

      {/* 1. Address */}
      <Section n={1} title={tr('address')}>
        {check ? (
          <Card className="px-4 py-3">
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 text-[17px] font-semibold">{address}</p>
              <button type="button" className="text-[15px] font-semibold text-brand" onClick={() => setCheck(null)}>
                {tr('change')}
              </button>
            </div>
            {check.member && (
              <p className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold text-brand-dark">
                <CheckIcon size={16} strokeWidth={3} /> {tr('onPlan')}
              </p>
            )}
          </Card>
        ) : (
          <>
            <Card>
              <AddressField
                value={address}
                onChange={setAddress}
                label={tr('address')}
                placeholder={tr('addressHint')}
                onPick={(a) => void checkAddress(a)}
              />
            </Card>
            <Button type="button" className="mt-3" onClick={() => void checkAddress()} disabled={checking}>
              {checking ? tr('checking') : tr('continue')}
            </Button>
          </>
        )}
        {check && (
          <div className="mt-3">
            {check.units.length > 0 && (
              <>
                <p className="mb-2 px-1 text-[15px] font-semibold">{tr('whichUnit')}</p>
                <div className="flex flex-wrap gap-2">
                  {check.units.map((u) => (
                    <button key={u} type="button" className={chip(unit === u && !unitOther)} onClick={() => { setUnit(u); setUnitOther(false) }}>
                      {u}
                    </button>
                  ))}
                  <button type="button" className={chip(unitOther)} onClick={() => { setUnit(''); setUnitOther(true) }}>
                    {tr('unitOther')}
                  </button>
                </div>
              </>
            )}
            {unitOther && (
              <Card className="mt-2">
                <Field label={tr('unitLabel')} placeholder={tr('unitHint')} value={unit} onChange={(e) => setUnit(e.target.value)} />
              </Card>
            )}
          </div>
        )}
      </Section>

      {check && (
        <>
          {/* 2. Issues */}
          <Section n={2} title={tr('whatNeedsFixing')} hint={tr('pickAll')}>
            <div className="flex flex-wrap gap-2">
              {quickPicks.map((q) => (
                <button key={q.key} type="button" className={chip(picked.some((p) => p.key === q.key))} onClick={() => togglePick(q.key)}>
                  {lang === 'he' ? q.he : q.en}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-3">
              {picked.map((p) => {
                const q = quickPicks.find((x) => x.key === p.key)
                const photos = photoHandlers(p.key, 'photos')
                const stickers = photoHandlers(p.key, 'stickers')
                return (
                  <Card key={p.key} className="pb-3">
                    <div className="flex items-center gap-2 px-4 pt-3">
                      <p className="min-w-0 flex-1 text-[17px] font-semibold">{q ? (lang === 'he' ? q.he : q.en) : p.key}</p>
                      <button type="button" onClick={() => togglePick(p.key)} className="text-muted" aria-label={tr('remove')}>
                        <CloseIcon size={20} />
                      </button>
                    </div>
                    {guideFor(p.key) && (
                      p.tried.length ? (
                        <p className="px-4 pt-1 text-[14px] text-brand-dark">{tr('triedNote')}</p>
                      ) : (
                        <button type="button" onClick={() => setGuideKey(p.key)} className="mx-4 mt-2 min-h-10 rounded-xl bg-canvas px-3 text-[15px] font-semibold text-brand">
                          {tr('tryThisFirst')}
                        </button>
                      )
                    )}
                    {p.key === 'other' && (
                      <TextArea
                        label={tr('describeOther')}
                        rows={2}
                        value={p.text}
                        onChange={(e) => setPick(p.key, (x) => ({ ...x, text: e.target.value }))}
                      />
                    )}
                    <PhotoPicker
                      label={tr('addPhoto')}
                      note={urgency === 'emergency' ? tr('photoOptionalEmergency') : tr('photoRequired')}
                      photos={p.photos}
                      onFiles={(files) => void addPhotos(files, photos.add, photos.update)}
                      onRemove={photos.remove}
                      lang={lang}
                    />
                    {q?.appliance && (
                      <PhotoPicker
                        label={tr('stickerPhoto')}
                        note={tr('stickerHint')}
                        photos={p.stickers}
                        onFiles={(files) => void addPhotos(files, stickers.add, stickers.update)}
                        onRemove={stickers.remove}
                        lang={lang}
                      />
                    )}
                  </Card>
                )
              })}
            </div>
            {fixedNote && <p className="mt-3 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">{tr('glad')}</p>}
            <Card className="mt-3">
              <TextArea label={tr('moreDetails')} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Card>
            {!check.member && (
              <Card className="mt-3 pb-3">
                <TextArea
                  label={tr('punchList')}
                  placeholder={tr('punchListHint')}
                  rows={3}
                  value={punchList}
                  onChange={(e) => setPunchList(e.target.value)}
                />
                <PhotoPicker
                  label={tr('addScreenshot')}
                  photos={listPhotos}
                  onFiles={(files) =>
                    void addPhotos(
                      files,
                      (ph) => setListPhotos((l) => [...l, ph]),
                      (id, patch) => setListPhotos((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x))),
                    )
                  }
                  onRemove={(id) => setListPhotos((l) => l.filter((x) => x.id !== id))}
                  lang={lang}
                />
              </Card>
            )}
          </Section>

          {/* 3. Urgency */}
          <Section n={3} title={tr('howUrgent')}>
            <Card>
              {(['emergency', 'soon', 'whenever'] as Urgency[]).map((u, i) => (
                <div key={u}>
                  {i > 0 && <Divider />}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={urgency === u}
                    onClick={() => setUrgency(u)}
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-start active:bg-canvas"
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${urgency === u ? (u === 'emergency' ? 'border-problem bg-problem' : 'border-brand bg-brand') : 'border-[#c7c7cc]'}`}>
                      {urgency === u && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[17px] font-semibold ${u === 'emergency' ? 'text-problem' : ''}`}>{tr(u)}</span>
                      <span className="block text-[14px] text-muted">{tr(`${u}Hint` as 'soonHint')}</span>
                      {u === 'emergency' && page.emergency_fee > 0 && (
                        <span className="block text-[14px] text-muted">{tr('emergencyFee', { fee: money(page.emergency_fee) })}</span>
                      )}
                    </span>
                  </button>
                </div>
              ))}
            </Card>
            {urgency === 'emergency' && callNumber && (
              <div className="mt-3">
                <p className="mb-2 px-1 text-[15px]">{tr('callNowHint')}</p>
                <a
                  href={phoneLink(callNumber)}
                  className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-problem text-[20px] font-bold text-white active:opacity-80"
                >
                  <PhoneIcon size={24} /> {tr('callNow')}
                </a>
              </div>
            )}
          </Section>

          {/* 4. Contact */}
          <Section n={4} title={tr('yourDetails')}>
            <Card>
              <Field label={tr('name')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              <Divider />
              <Field
                label={tr('phone')}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(732) 555-1234"
              />
            </Card>
            <p className="mb-2 mt-4 px-1 text-[15px] font-semibold">{tr('iAm')}</p>
            <div className="flex flex-wrap gap-2">
              {(['tenant', 'landlord', 'other'] as const).map((k) => (
                <button key={k} type="button" className={chip(kind === k)} onClick={() => setKind(k)}>
                  {tr(k)}
                </button>
              ))}
            </div>
            {urgency !== 'emergency' && (
              <>
                <p className="mb-2 mt-4 px-1 text-[15px] font-semibold">{tr('bestDays')}</p>
                <div className="flex flex-wrap gap-2">
                  {weekdays.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      className={chip(days.includes(d.key))}
                      onClick={() => setDays((list) => (list.includes(d.key) ? list.filter((x) => x !== d.key) : [...list, d.key]))}
                    >
                      {lang === 'he' ? d.he : d.en}
                    </button>
                  ))}
                </div>
                <p className="mb-2 mt-4 px-1 text-[15px] font-semibold">{tr('bestHours')}</p>
                <div className="flex flex-wrap gap-2">
                  {(['morning', 'afternoon', 'evening', 'anyTime'] as const).map((h) => (
                    <button key={h} type="button" className={chip(hours === t('en', h))} onClick={() => setHours(hours === t('en', h) ? '' : t('en', h))}>
                      {tr(h)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Section>

          {problem && (
            <div className="rounded-2xl bg-progress-soft px-4 py-3 text-[15px] text-[#8a4b00]" role="alert">
              {problem}
            </div>
          )}
          {Boolean(sendError) && <ErrorNote error={sendError} />}
          <Button type="button" onClick={() => void send()} disabled={sending}>
            {sending ? tr('sending') : tr('send')}
          </Button>
        </>
      )}
      {!check && Boolean(sendError) && <ErrorNote error={sendError} />}
      {guideKey && guideFor(guideKey) && (
        <GuideSheet
          guide={guideFor(guideKey)!}
          lang={lang}
          phone={page.phone}
          whatsapp={page.whatsapp}
          onClose={() => setGuideKey(null)}
          onFixed={() => {
            setPicked((list) => list.filter((p) => p.key !== guideKey))
            setFixedNote(true)
            setGuideKey(null)
          }}
          onStill={(tried) => {
            setPick(guideKey, (p) => ({ ...p, tried }))
            setGuideKey(null)
          }}
        />
      )}
      {!check && problem && <p className="px-1 text-[15px] text-[#8a4b00]">{problem}</p>}
    </div>
  )
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[20px] font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[15px] text-white">{n}</span>
        {title}
      </h2>
      {hint && <p className="-mt-1 mb-2 px-1 text-[15px] text-muted">{hint}</p>}
      {children}
    </section>
  )
}

function PhotoPicker({
  label,
  note,
  photos,
  onFiles,
  onRemove,
  lang,
}: {
  label: string
  note?: string
  photos: Photo[]
  onFiles: (files: FileList | null) => void
  onRemove: (id: string) => void
  lang: Lang
}) {
  return (
    <div className="px-4 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((ph) => (
          <div key={ph.id} className="relative h-20 w-20 overflow-hidden rounded-xl bg-canvas">
            <img src={ph.url} alt="" className={`h-full w-full object-cover ${ph.path ? '' : 'opacity-50'}`} />
            {!ph.path && !ph.error && (
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold">{t(lang, 'uploading')}</span>
            )}
            {ph.error && <span className="absolute inset-x-0 bottom-0 bg-problem px-1 text-[10px] text-white">{ph.error}</span>}
            <button
              type="button"
              onClick={() => onRemove(ph.id)}
              className="absolute end-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
              aria-label={t(lang, 'remove')}
            >
              <CloseIcon size={14} />
            </button>
          </div>
        ))}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-brand-soft px-3 text-[15px] font-semibold text-brand-dark active:opacity-70">
          <CameraIcon size={20} />
          {label}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              onFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {note && <p className="mt-1 text-[13px] text-muted">{note}</p>}
    </div>
  )
}

function Thanks({ lang, page, result }: { lang: Lang; page: PageInfo; result: SubmitResult }) {
  const tr = (key: Parameters<typeof t>[1], vars?: Record<string, string | number>) => t(lang, key, vars)
  const link = result.token ? `${window.location.origin}/s/${result.token}` : ''
  const callNumber = page.emergency_phone || page.phone
  return (
    <div className="space-y-5">
      <Card className="px-5 py-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white">
          <CheckIcon size={30} strokeWidth={3} />
        </span>
        <h2 className="mt-3 text-[24px] font-bold">{tr('thanksTitle')}</h2>
        <p className="mt-1 text-[17px] text-muted">{result.emergency ? tr('thanksEmergency') : tr('thanksBody')}</p>
      </Card>
      {result.emergency && callNumber && (
        <a
          href={phoneLink(callNumber)}
          className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-problem text-[20px] font-bold text-white"
        >
          <PhoneIcon size={24} /> {tr('callNow')}
        </a>
      )}
      {link && (
        <Card className="px-4 py-4">
          <p className="text-[15px]">{tr('statusLinkNote')}</p>
          <a href={link} className="mt-2 block break-all text-[15px] font-semibold text-brand" dir="ltr">
            {link}
          </a>
        </Card>
      )}
      {!result.member && page.plan?.price != null && (
        <Card className="px-4 py-4">
          <p className="text-[15px]">
            {tr('planPitch', { price: money(page.plan.price), hours: page.plan.hours, months: page.plan.every_months })}
          </p>
        </Card>
      )}
      <Button variant="secondary" onClick={() => window.location.reload()}>
        {tr('newRequest')}
      </Button>
    </div>
  )
}
