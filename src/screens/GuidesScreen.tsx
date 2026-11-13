import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TrashIcon } from '../components/Icons'
import { Screen } from '../components/Screen'
import { Button, Card, Divider, ErrorNote, Field, GroupLabel, Loading, TextArea, Toggle } from '../components/ui'
import { backend } from '../data/backend'
import { starterGuides } from '../data/guides'
import { refreshAll, useGuides } from '../data/queries'
import type { Guide, GuideStep, Localized } from '../data/types'
import { useUser } from '../lib/auth'
import { quickPicks } from '../lib/i18n'

const guideKeys = quickPicks.filter((q) => q.key !== 'other')

/** Me → Request page → Guides: what tenants can try before sending a request */
export function GuidesScreen() {
  const { data: guides, isLoading, error } = useGuides()
  return (
    <Screen title="Guides" back={{ to: '/request-page', label: 'Request page' }}>
      <p className="-mt-3 mb-5 px-1 text-[15px] text-muted">
        Short safe checks tenants can try first (“Try this first”). Only published guides show on the request page. Each one ends with
        “That fixed it” or “Still not working: send request”, and their answers come with the request.
      </p>
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {guides && (
        <Card>
          {guideKeys.map((q, i) => {
            const g = guides.find((x) => x.issue_key === q.key)
            return (
              <Link key={q.key} to={`/request-page/guides/${q.key}`} className={`flex min-h-14 items-center gap-3 px-4 py-2 active:bg-canvas ${i ? 'border-t border-hairline' : ''}`}>
                <span className="min-w-0 flex-1 text-[17px]">{q.en}</span>
                <span className={`text-[13px] font-semibold ${g?.published ? 'text-brand' : 'text-muted'}`}>
                  {g ? (g.published ? 'Published' : 'Draft') : 'None'}
                </span>
              </Link>
            )
          })}
        </Card>
      )}
    </Screen>
  )
}

const blankStep = (): GuideStep => ({ q: { en: '', he: '' }, tip: { en: '', he: '' } })

export function GuideEditScreen() {
  const { issueKey = '' } = useParams()
  const user = useUser()
  const owner = user.role === 'owner'
  const { data: guides, isLoading } = useGuides()
  const existing = guides?.find((g) => g.issue_key === issueKey)
  const pick = quickPicks.find((q) => q.key === issueKey)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState<Pick<Guide, 'title' | 'steps' | 'published'> | null>(null)

  useEffect(() => {
    if (guides && !form) {
      setForm(existing ? { title: existing.title, steps: existing.steps, published: existing.published } : { title: { en: pick?.en ?? '', he: pick?.he ?? '' }, steps: [], published: false })
    }
  }, [guides, form, existing, pick])

  const save = useMutation({
    mutationFn: (f: NonNullable<typeof form>) =>
      backend.saveGuide({
        ...f,
        id: existing?.id,
        issue_key: issueKey,
        steps: f.steps.filter((s) => s.q.en.trim()),
      }),
    onSuccess: () => {
      void refreshAll(qc)
      navigate('/request-page/guides')
    },
  })
  const remove = useMutation({
    mutationFn: () => backend.deleteGuide(existing!.id),
    onSuccess: () => {
      void refreshAll(qc)
      navigate('/request-page/guides')
    },
  })

  if (isLoading || !form) {
    return (
      <Screen title="Guide" back={{ to: '/request-page/guides', label: 'Guides' }}>
        <Loading />
      </Screen>
    )
  }
  const starter = starterGuides.find((g) => g.issue_key === issueKey)
  const setStep = (i: number, patch: Partial<GuideStep>) => setForm({ ...form, steps: form.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const loc = (value: Localized | undefined, lang: 'en' | 'he', text: string): Localized => ({ en: value?.en ?? '', he: value?.he ?? '', [lang]: text })

  return (
    <Screen title={pick?.en ?? 'Guide'} back={{ to: '/request-page/guides', label: 'Guides' }}>
      <div className="-mt-3 mb-5 rounded-2xl bg-progress-soft px-4 py-3 text-[14px] text-[#8a4b00]">
        Only safe checks: never ask tenants to open electrical panels, touch wiring, or work on gas lines.
      </div>
      {owner && form.steps.length === 0 && starter && (
        <Button variant="secondary" className="mb-5" onClick={() => setForm({ ...form, title: starter.title, steps: starter.steps })}>
          Start from our draft (English and Hebrew)
        </Button>
      )}
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(form)
        }}
      >
        <Card>
          <Field label="Title (English)" disabled={!owner} value={form.title.en} onChange={(e) => setForm({ ...form, title: loc(form.title, 'en', e.target.value) })} />
          <Divider />
          <Field label="Title (Hebrew)" dir="rtl" disabled={!owner} value={form.title.he ?? ''} onChange={(e) => setForm({ ...form, title: loc(form.title, 'he', e.target.value) })} />
        </Card>
        {form.steps.map((step, i) => (
          <section key={i}>
            <div className="flex items-center">
              <GroupLabel>Step {i + 1}</GroupLabel>
              {owner && (
                <button type="button" className="ml-auto flex h-9 w-9 items-center justify-center text-muted" aria-label={`Remove step ${i + 1}`} onClick={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })}>
                  <TrashIcon size={18} />
                </button>
              )}
            </div>
            <Card>
              <TextArea label="What to try (English)" rows={2} disabled={!owner} value={step.q.en} onChange={(e) => setStep(i, { q: loc(step.q, 'en', e.target.value) })} />
              <Divider />
              <TextArea label="What to try (Hebrew)" dir="rtl" rows={2} disabled={!owner} value={step.q.he ?? ''} onChange={(e) => setStep(i, { q: loc(step.q, 'he', e.target.value) })} />
              <Divider />
              <TextArea label="Safety tip (optional, English)" rows={2} disabled={!owner} value={step.tip?.en ?? ''} onChange={(e) => setStep(i, { tip: loc(step.tip, 'en', e.target.value) })} />
              <Divider />
              <TextArea label="Safety tip (optional, Hebrew)" dir="rtl" rows={2} disabled={!owner} value={step.tip?.he ?? ''} onChange={(e) => setStep(i, { tip: loc(step.tip, 'he', e.target.value) })} />
            </Card>
          </section>
        ))}
        {owner && (
          <Button type="button" variant="secondary" onClick={() => setForm({ ...form, steps: [...form.steps, blankStep()] })}>
            Add a step
          </Button>
        )}
        <Card>
          <Toggle label="Published" hint="Show “Try this first” on the request page" checked={form.published} onChange={(published) => owner && setForm({ ...form, published })} />
        </Card>
        {save.error && <ErrorNote error={save.error} />}
        {owner ? (
          <>
            <Button type="submit" disabled={save.isPending || (form.published && !form.steps.some((s) => s.q.en.trim()))}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
            {existing && (
              <Button type="button" variant="danger" onClick={() => window.confirm('Delete this guide?') && remove.mutate()}>
                Delete guide
              </Button>
            )}
          </>
        ) : (
          <p className="px-1 text-[15px] text-muted">Only the owner can change guides.</p>
        )}
      </form>
    </Screen>
  )
}
