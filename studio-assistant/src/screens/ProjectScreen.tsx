import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Camera,
  NotebookPen,
  ShoppingBag,
  Timer,
  CalendarDays,
  ChevronDown,
  Cloud,
  FileImage,
  FileSpreadsheet,
  FileText,
  Flag,
  FolderArchive,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Receipt,
  Send,
  Trash2,
  Upload,
  User,
} from 'lucide-react'
import { itemSeconds, projectSeconds, startTimer, stopTimer, uid, useNow, useStore } from '../data/store'
import { addDays, fmtClock, fmtDuration, fmtRelative, fmtShort, fmtStamp, today } from '../lib/dates'
import { money } from '../lib/money'
import { isArchived, totals } from '../data/billing'
import { TEAM } from '../data/sample'
import type { Project, ProjectFile, ShotItem } from '../data/types'
import { InvoiceBadge, PriorityBadge, StageBadge, StageStepper } from '../components/bits'
import { Whiteboard } from '../components/Whiteboard'
import { GalleryManager } from '../components/GalleryManager'
import { DropboxPicker, photosIn } from '../components/DropboxPicker'
import { api, errorText } from '../lib/api'
import { deleteFile, fileKind, fileSize, openFileUrl, uploadProjectFile } from '../lib/files'
import { EmailCard } from './HomeScreen'
import { Badge, Button, Card, Checkbox, Confirm, Empty, IconTile, Page, PageHeader, Section, Sheet, Field, cx, inputCls } from '../components/ui'
import { newInvoice } from './InvoicesScreen'

const TABS = ['overview', 'files', 'whiteboard', 'gallery', 'billing', 'messages'] as const
type Tab = (typeof TABS)[number]

export function ProjectScreen() {
  const { id, tab = 'overview' } = useParams()
  const { state, update } = useStore()
  const nav = useNavigate()
  const p = state.projects.find((x) => x.id === id)
  if (!p)
    return (
      <Page>
        <PageHeader title="Project" back="/projects" />
        <Empty title="Project not found" />
      </Page>
    )
  const client = state.clients.find((c) => c.id === p.clientId)
  const current = (TABS as readonly string[]).includes(tab) ? (tab as Tab) : 'overview'
  const edit = (fn: (p: Project) => void) => update((s) => fn(s.projects.find((x) => x.id === p.id)!))

  return (
    <Page wide={current === 'whiteboard' || current === 'gallery'}>
      <PageHeader
        back="/projects"
        title={p.title}
        subtitle={
          <Link to={`/clients/${client?.id}`} className="text-accent">
            {client?.company} · {client?.name}
          </Link>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StageBadge stage={p.stage} archived={isArchived(state, p)} />
          <button
            onClick={() => edit((x) => void (x.priority = x.priority === 'high' ? 'normal' : 'high'))}
            className="active:opacity-60"
            title="Tap to change priority"
          >
            {p.priority === 'high' ? (
              <PriorityBadge priority="high" />
            ) : (
              <Badge className="gap-1">
                <Flag size={11} /> Normal
              </Badge>
            )}
          </button>
          <label className="ml-auto flex items-center gap-1.5 text-[14px] text-ink-2">
            <CalendarDays size={16} />
            <span>
              Shoot {fmtRelative(p.shootDate)}
              {p.shootTime && `, ${p.shootTime}`}
            </span>
          </label>
        </div>
        <div className="mt-4">
          <StageStepper stage={p.stage} onChange={(s) => edit((x) => void (x.stage = s))} />
        </div>
      </Card>

      <div className="no-scrollbar sticky top-0 z-20 -mx-4 mt-4 overflow-x-auto bg-bg/90 px-4 py-2 backdrop-blur lg:mx-0 lg:px-0">
        <div className="flex w-max gap-1 rounded-[12px] bg-fill p-[3px] lg:w-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => nav(`/projects/${p.id}/${t}`, { replace: true })}
              className={cx(
                'h-8 rounded-[9px] px-3.5 text-[14px] font-medium capitalize transition lg:flex-1',
                current === t ? 'bg-card text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-ink-2',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2">
        {current === 'overview' && <Overview p={p} />}
        {current === 'files' && <Files p={p} />}
        {current === 'whiteboard' && <Whiteboard project={p} />}
        {current === 'gallery' && <GalleryTab p={p} />}
        {current === 'billing' && <Billing p={p} />}
        {current === 'messages' && <Messages p={p} />}
      </div>
    </Page>
  )
}

function Overview({ p }: { p: Project }) {
  const { state, update } = useStore()
  const running = state.timer?.projectId === p.id
  const now = useNow(running)
  const total = projectSeconds(state, p, now)
  const runningItem = running ? p.shotList.find((s) => s.id === state.timer?.itemId) : undefined
  const [newItem, setNewItem] = useState('')
  const [newOrder, setNewOrder] = useState('')
  const edit = (fn: (p: Project) => void) => update((s) => fn(s.projects.find((x) => x.id === p.id)!))
  const done = p.shotList.filter((s) => s.done).length

  return (
    <>
      <Card className={cx('flex items-center gap-4 p-4', running && 'bg-accent-soft')}>
        <IconTile icon={<Timer size={20} />} tone="blue" size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-ink-2">Project time</div>
          <div className="text-[32px] leading-tight font-semibold tracking-tight tabular-nums">{fmtClock(total)}</div>
          <div className="truncate text-[13px] text-ink-3">
            {runningItem ? `Timing: ${runningItem.title}` : `Adds up every shot · ${money((total / 3600) * state.settings.hourlyRate)} at ${money(state.settings.hourlyRate, false)}/h`}
          </div>
        </div>
        {running ? (
          <Button variant="secondary" onClick={() => update(stopTimer)} icon={<Pause size={16} fill="currentColor" />}>
            Pause
          </Button>
        ) : (
          p.shotList.length > 0 && (
            <Button
              variant="primary"
              onClick={() => {
                const next = p.shotList.find((s) => !s.done) ?? p.shotList[0]
                update((s) => startTimer(s, p.id, next.id))
              }}
              icon={<Play size={16} fill="currentColor" />}
            >
              {total > 0 ? 'Resume' : 'Start'}
            </Button>
          )
        )}
      </Card>

      <Section
        icon={<Camera size={15} />}
        tone="blue"
        title="Shot list"
        action={
          <span className="text-[13px] text-ink-2">
            {done} of {p.shotList.length} done
          </span>
        }
      >
        <Card className="overflow-hidden">
          {p.shotList.map((it) => (
            <ShotRow key={it.id} p={p} item={it} now={now} />
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!newItem.trim()) return
              edit((x) => x.shotList.push({ id: uid('s'), title: newItem.trim(), done: false, seconds: 0, due: p.shootDate, subtasks: [] }))
              setNewItem('')
            }}
            className="flex items-center gap-3 border-t border-line px-4 py-2.5"
          >
            <Plus size={22} className="text-accent" />
            <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add a shot" className="flex-1 bg-transparent py-1 outline-none placeholder:text-ink-3" />
          </form>
        </Card>
      </Section>

      <div className="grid gap-x-4 lg:grid-cols-2">
        <Section title="To order" icon={<ShoppingBag size={15} />} tone="orange">
          <Card className="overflow-hidden py-1">
            {p.toOrder.map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                <Checkbox checked={o.done} onChange={() => edit((x) => void (x.toOrder.find((y) => y.id === o.id)!.done = !o.done))} />
                <span className={cx('flex-1 text-[15px]', o.done && 'text-ink-3 line-through')}>{o.title}</span>
                {o.due && <span className={cx('text-[12px]', o.due <= today() && !o.done ? 'text-orange' : 'text-ink-3')}>{fmtRelative(o.due)}</span>}
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!newOrder.trim()) return
                edit((x) => x.toOrder.push({ id: uid('o'), title: newOrder.trim(), done: false, due: addDays(p.shootDate, -1) }))
                setNewOrder('')
              }}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <Plus size={22} className="text-accent" />
              <input value={newOrder} onChange={(e) => setNewOrder(e.target.value)} placeholder="Add item to order" className="flex-1 bg-transparent py-1 outline-none placeholder:text-ink-3" />
            </form>
          </Card>
        </Section>

        <Section title="Notes" icon={<NotebookPen size={15} />} tone="gold">
          <Card className="p-1">
            <textarea
              value={p.notes}
              onChange={(e) => edit((x) => void (x.notes = e.target.value))}
              rows={6}
              placeholder="Brief, mood, client preferences…"
              className="w-full resize-none rounded-xl bg-transparent px-3 py-2.5 text-[15px] outline-none"
            />
          </Card>
        </Section>
      </div>
    </>
  )
}

function ShotRow({ p, item, now }: { p: Project; item: ShotItem; now: number }) {
  const { state, update } = useStore()
  const [open, setOpen] = useState(false)
  const [sub, setSub] = useState('')
  const running = state.timer?.projectId === p.id && state.timer.itemId === item.id
  const secs = itemSeconds(state, p.id, item, now)
  const edit = (fn: (it: ShotItem) => void) =>
    update((s) => {
      fn(s.projects.find((x) => x.id === p.id)!.shotList.find((x) => x.id === item.id)!)
    })
  const subDone = item.subtasks.filter((s) => s.done).length

  return (
    <div className="[&+&]:border-t [&+&]:border-line">
      <div className="flex items-center gap-3 px-4 py-3">
        <Checkbox checked={item.done} onChange={() => edit((x) => void (x.done = !x.done))} />
        <button onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left">
          <div className={cx('text-[15px]', item.done && 'text-ink-3 line-through')}>{item.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-ink-2">
            {item.due && (
              <span className={cx('flex items-center gap-1', item.due < today() && !item.done && 'text-red')}>
                <CalendarDays size={12} /> {fmtRelative(item.due)}
              </span>
            )}
            {item.assignee && (
              <span className="flex items-center gap-1">
                <User size={12} /> {item.assignee}
              </span>
            )}
            {item.subtasks.length > 0 && (
              <span>
                {subDone}/{item.subtasks.length} sub-tasks
              </span>
            )}
            <ChevronDown size={14} className={cx('text-ink-3 transition', open && 'rotate-180')} />
          </div>
        </button>
        <button
          onClick={() => (running ? update(stopTimer) : update((s) => startTimer(s, p.id, item.id)))}
          className={cx(
            'flex h-9 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-[13px] font-semibold tabular-nums transition',
            running ? 'bg-accent text-white' : 'bg-fill text-ink-2',
          )}
          aria-label={running ? 'Pause timer' : 'Start timer'}
        >
          {running ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          {fmtClock(secs)}
        </button>
      </div>
      {open && (
        <div className="anim-fade bg-fill/50 px-4 pt-1 pb-3 pl-[52px]">
          {item.subtasks.map((st) => (
            <div key={st.id} className="flex items-center gap-2.5 py-1.5">
              <Checkbox size={20} checked={st.done} onChange={() => edit((x) => void (x.subtasks.find((y) => y.id === st.id)!.done = !st.done))} />
              <span className={cx('text-[14px]', st.done && 'text-ink-3 line-through')}>{st.title}</span>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!sub.trim()) return
              edit((x) => x.subtasks.push({ id: uid('st'), title: sub.trim(), done: false }))
              setSub('')
            }}
            className="flex items-center gap-2.5 py-1.5"
          >
            <Plus size={20} className="text-accent" />
            <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Add sub-task (e.g. Re-edit: brighter)" className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-3" />
          </form>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Due">
              <input type="date" value={item.due ?? ''} onChange={(e) => edit((x) => void (x.due = e.target.value || undefined))} className={cx(inputCls, 'py-1.5')} />
            </Field>
            <Field label="Assignee">
              <select value={item.assignee ?? ''} onChange={(e) => edit((x) => void (x.assignee = e.target.value || undefined))} className={cx(inputCls, 'py-1.5')}>
                <option value="">No one</option>
                {TEAM.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-2 flex justify-between">
            <span className="text-[12px] text-ink-3">Time on this shot: {fmtDuration(secs)}</span>
            <button
              onClick={() =>
                update((s) => {
                  if (running) stopTimer(s)
                  const proj = s.projects.find((x) => x.id === p.id)!
                  proj.shotList = proj.shotList.filter((x) => x.id !== item.id)
                })
              }
              className="flex items-center gap-1 text-[13px] text-red"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const FILE_ICON: Record<ProjectFile['kind'], ReactNode> = {
  pdf: <FileText className="text-red" />,
  doc: <FileText className="text-accent" />,
  image: <FileImage className="text-purple" />,
  sheet: <FileSpreadsheet className="text-green" />,
  zip: <FolderArchive className="text-gold" />,
}

function Files({ p }: { p: Project }) {
  const { update, toast, live } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [removing, setRemoving] = useState<ProjectFile | null>(null)
  const edit = (fn: (x: Project) => void) => update((s) => fn(s.projects.find((x) => x.id === p.id)!))

  const addSample = () => {
    const samples: Omit<ProjectFile, 'id' | 'added'>[] = [
      { name: 'Props list.pdf', kind: 'pdf', size: '320 KB' },
      { name: 'Lighting diagram.jpg', kind: 'image', size: '860 KB' },
      { name: 'Client logo pack.zip', kind: 'zip', size: '12.4 MB' },
    ]
    const f = samples[p.files.length % samples.length]
    edit((x) => void x.files.unshift({ ...f, id: uid('f'), added: today() }))
    toast(`${f.name} added`)
  }

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(files.length)
    for (const file of Array.from(files)) {
      const id = uid('f')
      try {
        const path = await uploadProjectFile(p.id, id, file)
        edit((x) => void x.files.unshift({ id, name: file.name, kind: fileKind(file.name), size: fileSize(file.size), added: today(), path }))
      } catch (e) {
        toast(errorText(e))
      }
      setUploading((n) => n - 1)
    }
    if (input.current) input.current.value = ''
  }

  const open = async (f: ProjectFile) => {
    if (!f.path) return toast(`${f.name} is a sample file`)
    // Open the tab first so phones don't block it as a pop-up
    const win = window.open('', '_blank')
    try {
      const url = await openFileUrl(f.path)
      if (win) win.location.href = url
      else location.href = url
    } catch (e) {
      win?.close()
      toast(errorText(e))
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
          <Cloud size={15} /> {live ? 'Stored privately with your account' : 'Sample files'}
        </span>
        <Button variant="tinted" size="sm" icon={<Upload size={15} />} disabled={uploading > 0} onClick={() => (live ? input.current?.click() : addSample())}>
          {uploading > 0 ? `Uploading ${uploading}…` : 'Add files'}
        </Button>
        <input ref={input} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
      </div>
      {p.files.length ? (
        <Card className="overflow-hidden">
          {p.files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3 [&+&]:border-t [&+&]:border-line">
              <button onClick={() => void open(f)} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-60">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fill">{FILE_ICON[f.kind]}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px]">{f.name}</div>
                  <div className="text-[12px] text-ink-3">
                    {f.size} · added {fmtShort(f.added)}
                  </div>
                </div>
              </button>
              <button onClick={() => setRemoving(f)} aria-label={`Delete ${f.name}`} className="p-2 text-ink-3 active:text-red">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </Card>
      ) : (
        <Card>
          <Empty icon={<FileText size={30} />} title="No files yet" text="Briefs, mood boards and spec sheets for this shoot go here." />
        </Card>
      )}
      <Confirm
        open={!!removing}
        title="Delete this file?"
        message={removing?.name ?? ''}
        confirmLabel="Delete"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const f = removing!
          setRemoving(null)
          edit((x) => void (x.files = x.files.filter((y) => y.id !== f.id)))
          if (f.path) void deleteFile(f.path)
        }}
      />
    </>
  )
}

function GalleryTab({ p }: { p: Project }) {
  const { state, update, toast, live } = useStore()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const g = state.galleries.find((x) => x.id === p.galleryId)

  const createFrom = async (path: string) => {
    setPicking(false)
    setBusy(true)
    try {
      const photos = await photosIn(path)
      const id = uid('g')
      update((s) => {
        s.galleries.push({ id, projectId: p.id, title: p.title, dropboxPath: path, photos, coverId: photos[0]?.id ?? '', lockDownloads: true })
        s.projects.find((x) => x.id === p.id)!.galleryId = id
      })
      toast(`Gallery created with ${photos.length} photos`)
    } catch (e) {
      toast(errorText(e))
    }
    setBusy(false)
  }

  if (!g)
    return (
      <Card>
        <Empty icon={<Cloud size={32} />} title="No gallery yet" text="Make a client gallery from this project’s Dropbox folder." />
        <div className="flex justify-center pb-8">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              if (live) return setPicking(true)
              const id = uid('g')
              update((s) => {
                const src = s.galleries[0].photos.slice(0, 8).map((ph, i) => ({ ...ph, id: uid('ph'), favourite: false, comments: [], name: `${p.title} — ${String(i + 1).padStart(2, '0')}` }))
                s.galleries.push({ id, projectId: p.id, title: p.title, dropboxPath: `/Studio/Clients/${p.title}/Selects`, photos: src, coverId: src[0].id, lockDownloads: true })
                s.projects.find((x) => x.id === p.id)!.galleryId = id
              })
              toast('Gallery created from Dropbox')
            }}
          >
            {busy ? 'Loading photos…' : live ? 'Choose Dropbox folder' : 'Create gallery'}
          </Button>
        </div>
        <DropboxPicker open={picking} onClose={() => setPicking(false)} onPick={(path) => void createFrom(path)} />
      </Card>
    )
  return <GalleryManager gallery={g} />
}

function Billing({ p }: { p: Project }) {
  const { state, update } = useStore()
  const nav = useNavigate()
  const invs = state.invoices.filter((i) => i.projectId === p.id)
  const secs = projectSeconds(state, p, Date.now())
  const create = (kind: 'estimate' | 'invoice', method: 'items' | 'hourly') => {
    const id = uid('i')
    update((s) => newInvoice(s, id, p.id, kind, method))
    nav(`/invoices/${id}/edit`)
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-4">
          <IconTile icon={<Timer size={15} />} tone="blue" size={26} />
          <div className="mt-2 text-[13px] text-ink-2">Tracked time</div>
          <div className="text-[22px] font-semibold text-accent tabular-nums">{fmtDuration(secs)}</div>
        </Card>
        <Card className="p-4">
          <IconTile icon={<Receipt size={15} />} tone="green" size={26} />
          <div className="mt-2 text-[13px] text-ink-2">At hourly rate</div>
          <div className="text-[22px] font-semibold text-green tabular-nums">{money((secs / 3600) * state.settings.hourlyRate)}</div>
        </Card>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="tinted" onClick={() => create('estimate', 'items')}>
          New estimate
        </Button>
        <Button variant="primary" onClick={() => create('invoice', 'items')}>
          New invoice
        </Button>
      </div>
      <Section title="Estimates and invoices" icon={<Receipt size={15} />} tone="green">
        {invs.length ? (
          <Card className="overflow-hidden">
            {invs.map((inv) => {
              const t = totals(inv, state.settings)
              return (
                <button key={inv.id} onClick={() => nav(`/invoices/${inv.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fill [&+&]:border-t [&+&]:border-line">
                  <Receipt size={20} className="text-ink-3" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium">
                      {inv.number} <span className="font-normal text-ink-2">· {inv.kind === 'estimate' ? 'Estimate' : 'Invoice'}</span>
                    </div>
                    <div className="text-[12px] text-ink-2">
                      {inv.method === 'hourly' ? 'Hourly' : 'By item'}
                      {t.deposit > 0 && ` · deposit ${money(t.deposit)}`}
                      {t.paid > 0 && ` · paid ${money(t.paid)}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-semibold tabular-nums">{money(t.total)}</div>
                    <InvoiceBadge inv={inv} />
                  </div>
                </button>
              )
            })}
          </Card>
        ) : (
          <Card>
            <Empty icon={<Receipt size={30} />} title="Nothing billed yet" />
          </Card>
        )}
      </Section>
    </>
  )
}

function Messages({ p }: { p: Project }) {
  const { state, toast, live } = useStore()
  const client = state.clients.find((c) => c.id === p.clientId)
  const emails = state.emails.filter((e) => e.projectId === p.id).sort((a, b) => b.receivedAt - a.receivedAt)
  const g = state.galleries.find((x) => x.id === p.galleryId)
  const comments = (g?.photos ?? []).flatMap((ph) => ph.comments.map((c) => ({ c, ph }))).sort((a, b) => b.c.at - a.c.at)
  const [msg, setMsg] = useState('')
  const [subject, setSubject] = useState(p.title)
  const [compose, setCompose] = useState(false)
  const [sending, setSending] = useState(false)

  const sendEmail = async () => {
    if (!client?.email || !msg.trim()) return toast(client?.email ? 'Write a message first' : 'Add an email address for this client first')
    if (live) {
      setSending(true)
      try {
        await api('gmail/send', { body: { to: client.email, subject, text: msg } })
      } catch (e) {
        setSending(false)
        return toast(errorText(e))
      }
      setSending(false)
    }
    setCompose(false)
    setMsg('')
    toast(`Email sent to ${client.email}`)
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" size="sm" icon={<Send size={14} />} onClick={() => setCompose(true)}>
          New email
        </Button>
      </div>
      {emails.length > 0 && (
        <div className="space-y-3">
          {emails.map((e) => (
            <EmailCard key={e.id} email={e} compact />
          ))}
        </div>
      )}
      <Section title="Gallery comments" icon={<MessageSquare size={15} />} tone="purple">
        {comments.length ? (
          <Card className="overflow-hidden">
            {comments.map(({ c, ph }) => (
              <Link key={c.id} to={`/projects/${p.id}/gallery`} className="flex gap-3 px-4 py-3 active:bg-fill [&+&]:border-t [&+&]:border-line">
                <MessageSquare size={18} className={cx('mt-0.5 shrink-0', c.fromClient ? 'text-accent' : 'text-ink-3')} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-[13px] text-ink-2">
                    <span className="font-semibold text-ink">{c.who}</span>
                    <span>{fmtStamp(c.at)}</span>
                  </div>
                  <div className="text-[15px]">{c.text}</div>
                  <div className="text-[12px] text-ink-3">on {ph.name}</div>
                </div>
              </Link>
            ))}
          </Card>
        ) : (
          <Card>
            <Empty title="No comments yet" />
          </Card>
        )}
      </Section>
      {!emails.length && !comments.length && <p className="mt-2 text-center text-[13px] text-ink-3">Emails you link to this project show up here.</p>}
      <Sheet
        open={compose}
        onClose={() => setCompose(false)}
        title={`Email ${client?.name.split(' ')[0]}`}
        footer={
          <Button
            variant="primary"
            size="lg"
            onClick={() => void sendEmail()}
            disabled={sending}
          >
            {sending ? 'Sending…' : 'Send'}
          </Button>
        }
      >
        <div className="mb-3 text-[14px] text-ink-2">To: {client?.email || 'no email address yet'}</div>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className={cx(inputCls, 'mb-3')} />
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={8} placeholder="Write a message…" className={inputCls} />
      </Sheet>
    </>
  )
}
