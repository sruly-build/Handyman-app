import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  PersonIcon,
  BookIcon,
  ChecklistIcon,
  ChevronIcon,
  ClockIcon,
  DirectionsIcon,
  MessageIcon,
  InvoiceIcon,
  PhoneIcon,
  PhotosIcon,
  PeopleIcon,
  PlusIcon,
  TagIcon,
} from '../components/Icons'
import { Screen } from '../components/Screen'
import { TextClientSheet } from '../components/TextClient'
import { AssignSheet } from '../components/AssignSheet'
import { ClockCard } from '../components/TimeWidgets'
import {
  Card,
  Divider,
  EmptyState,
  ErrorNote,
  Loading,
  ProgressBar,
  RowLink,
  SectionTitle,
  StatusDot,
} from '../components/ui'
import { backend } from '../data/backend'
import { buildBill, formatMoney, paymentSummary } from '../data/billing'
import { buildBringList } from '../data/bring'
import {
  keys,
  refreshAll,
  useBringChecks,
  useInvoice,
  useItems,
  useJob,
  useParts,
  useCompany,
  usePayments,
  useCharges,
  useSettings,
  useMyShare,
  useAssignments,
  useContacts,
  useShares,
  useTime,
} from '../data/queries'
import { formatDuration, totalMs } from '../data/time'
import type { ItemStatus, PunchItem } from '../data/types'
import { isLead, isPartnerJob } from '../data/api'
import { LeadActions, LeadPanel } from '../components/LeadPanel'
import { useUser } from '../lib/auth'
import { clockLabel, friendlyDate } from '../lib/dates'
import { directionsLink, phoneLink } from '../lib/links'

const nextStatus: Record<ItemStatus, ItemStatus> = { todo: 'in_progress', in_progress: 'done', done: 'todo' }

export function JobDetailScreen() {
  const { jobId = '' } = useParams()
  const { data: job, isLoading, error } = useJob(jobId)
  const { data: items } = useItems(jobId)
  const user = useUser()
  // Another company's job shared with us: punch list and photos, plus what they chose to share
  const partner = job ? isPartnerJob(job, user) : false
  const { data: myShare } = useMyShare(jobId, partner)
  const { data: parts = [] } = useParts(jobId, partner, Boolean(job))
  const { data: checks = [] } = useBringChecks(jobId)
  const { data: entries = [] } = useTime(jobId)
  const { data: settings } = useSettings()
  const { data: invoice } = useInvoice(jobId)
  const { data: charges = [] } = useCharges(jobId)
  const { data: payments = [] } = usePayments(jobId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: contacts = [] } = useContacts()
  // Only when the client is in my own directory (the job may have been made by someone else)
  const client = contacts.find((c) => c.id === job?.client_id && c.owner_id === user.id)
  const [texting, setTexting] = useState(false)
  const [assigning, setAssigning] = useState<PunchItem | null>(null)
  // Items given to vendors (my company only; never for a shared job)
  const { data: assignments = [] } = useAssignments(jobId, Boolean(job) && !(job && isPartnerJob(job, user)))
  const vendorOf = (itemId: string) => assignments.find((a) => a.id === itemId)
  const { data: ownerCompany } = useCompany(job?.company_id, partner)
  const { data: shares = [] } = useShares(jobId, Boolean(job) && !partner)

  const leave = useMutation({
    mutationFn: () => backend.unshareJob(jobId, user.companyId),
    onSuccess: () => {
      void refreshAll(qc)
      navigate('/jobs', { replace: true })
    },
  })

  // Tapping the circle moves an item along: to do → in progress → done
  const cycle = useMutation({
    mutationFn: (item: PunchItem) => backend.updateItem(item.id, { status: nextStatus[item.status] }),
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: keys.items(jobId) })
      qc.setQueryData<PunchItem[]>(keys.items(jobId), (old) =>
        old?.map((i) => (i.id === item.id ? { ...i, status: nextStatus[item.status] } : i)),
      )
    },
    onSettled: () => refreshAll(qc),
  })

  const lead = job ? isLead(job) : false
  const back = lead ? { to: '/leads', label: 'Leads' } : { to: '/jobs', label: 'Jobs' }
  if (isLoading || error || !job) {
    return (
      <Screen title="Job" back={back}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    )
  }

  const done = items?.filter((i) => i.status === 'done').length ?? 0
  const total = items?.length ?? 0

  const bring = buildBringList(items ?? [], parts, job.bring_extras ?? [])
  const packed = bring.filter((b) => checks.some((c) => c.key === b.key)).length
  const paid = parts.filter((p) => p.status !== 'needed').reduce((sum, p) => sum + (p.cost ?? 0), 0)
  const onSite = totalMs(
    entries.filter((e) => e.kind === 'visit'),
    Date.now(),
  )
  const estimate = settings
    ? buildBill(
        { items: items ?? [], parts, entries, settings, job, charges, assignments, now: Date.now() },
        'estimate',
      ).total
    : 0
  const { balance } = paymentSummary(invoice ? Number(invoice.total) : 0, payments)
  const billValue = !invoice
    ? formatMoney(estimate)
    : invoice.status === 'paid'
      ? `${formatMoney(invoice.total)} · Paid`
      : balance < Number(invoice.total)
        ? `${formatMoney(balance)} due`
        : formatMoney(invoice.total)

  return (
    <Screen
      title={job.customer_name}
      eyebrow={
        lead
          ? 'Lead'
          : `${friendlyDate(job.job_date)}${job.job_date && job.job_time ? ` · ${clockLabel(job.job_time)}` : ''}`
      }
      back={back}
      action={
        !partner && (
          <Link to={`/jobs/${job.id}/edit`} className="min-h-11 px-1 py-2 text-[17px] text-brand active:opacity-50">
            Edit
          </Link>
        )
      }
    >
      {job.address && <p className="-mt-3 mb-4 text-[17px] text-muted">{job.address}</p>}

      <div className="grid grid-cols-3 gap-3">
        <ActionButton
          href={job.customer_phone ? phoneLink(job.customer_phone) : undefined}
          label="Call"
          Icon={PhoneIcon}
        />
        <ActionButton
          onClick={job.customer_phone ? () => setTexting(true) : undefined}
          label="Text"
          Icon={MessageIcon}
        />
        <ActionButton
          href={job.address ? directionsLink(job.address) : undefined}
          label="Directions"
          Icon={DirectionsIcon}
          newTab
        />
      </div>

      {texting && (
        <TextClientSheet phone={job.customer_phone} customer={job.customer_name} onClose={() => setTexting(false)} />
      )}

      {(job.customer_phone || job.customer_email || job.notes) && (
        <Card className="mt-4">
          {job.customer_phone && <InfoRow label="Phone" value={job.customer_phone} />}
          {job.customer_phone && (job.customer_email || job.notes) && <Divider />}
          {job.customer_email && <InfoRow label="Email" value={job.customer_email} />}
          {job.customer_email && job.notes && <Divider />}
          {job.notes && <InfoRow label={lead ? 'What they need' : 'Notes'} value={job.notes} />}
        </Card>
      )}

      {lead && <LeadPanel lead={job} />}

      {lead ? null : partner ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 px-1 text-[13px] text-muted">
          <PeopleIcon size={14} className="shrink-0" />
          <span>Shared by {ownerCompany?.name || 'another company'}</span>
          <span aria-hidden>·</span>
          <button
            onClick={() => confirm('Remove this job from your list? They can share it again later.') && leave.mutate()}
            className="min-h-8 text-muted underline active:opacity-50"
          >
            Remove from my list
          </button>
        </p>
      ) : (
        <Link
          to={`/jobs/${job.id}/share`}
          className="mt-3 flex min-h-8 items-center gap-1.5 px-1 text-[13px] text-muted active:opacity-50"
        >
          <PeopleIcon size={14} className="shrink-0" />
          <span className="truncate">
            {shares.length
              ? `Shared with ${shares.map((s) => s.company_name).join(', ')}`
              : 'Share with another company'}
          </span>
        </Link>
      )}
      {client && !lead && (
        <Link
          to={`/directory/${client.id}`}
          className="flex min-h-8 items-center gap-1.5 px-1 text-[13px] text-muted active:opacity-50"
        >
          <BookIcon size={14} className="shrink-0" />
          <span className="truncate">Client history: all of {client.name.split(/\s+/)[0]}'s jobs and payments</span>
        </Link>
      )}
      {leave.error && <ErrorNote error={leave.error} />}

      {!lead && (!partner || myShare?.share_time) && (
        <>
          <SectionTitle>Time</SectionTitle>
          <ClockCard jobId={job.id} />
        </>
      )}

      <SectionTitle
        action={
          total > 0 && (
            <span className="pb-0.5 text-[15px] font-semibold text-muted">
              {done} of {total} done
            </span>
          )
        }
      >
        Punch list
      </SectionTitle>
      {total > 0 && (
        <div className="mb-3 px-1">
          <ProgressBar done={done} total={total} />
        </div>
      )}

      {items && items.length === 0 && (
        <EmptyState title="Nothing on the list yet">Add each thing that needs fixing as its own item.</EmptyState>
      )}

      {items && items.length > 0 && (
        <Card>
          {items.map((item, idx) => (
            <div key={item.id}>
              {idx > 0 && <Divider />}
              <div className="flex items-center">
                <button
                  onClick={() => cycle.mutate(item)}
                  className="flex h-16 w-16 shrink-0 items-center justify-center active:opacity-50"
                  aria-label={`Status: ${item.status.replace('_', ' ')}. Tap to change.`}
                >
                  <StatusDot status={item.status} />
                </button>
                <Link
                  to={`/jobs/${job.id}/items/${item.id}`}
                  className={`flex min-h-16 min-w-0 flex-1 items-center gap-2 py-3 active:opacity-60 ${partner ? 'pr-4' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[17px] font-medium leading-snug ${item.status === 'done' ? 'text-muted line-through decoration-[#c7c7cc]' : ''}`}
                    >
                      {item.title}
                    </p>
                    {item.location && <p className="truncate text-[14px] text-muted">{item.location}</p>}
                    {vendorOf(item.id) && (
                      <p className="truncate text-[13px] font-medium text-brand-dark">{vendorOf(item.id)!.name}</p>
                    )}
                  </div>
                  {partner && <ChevronIcon size={20} className="shrink-0 text-[#c7c7cc]" />}
                </Link>
                {/* Who is doing it: quiet grey until someone is assigned */}
                {!partner && (
                  <button
                    onClick={() => setAssigning(item)}
                    className={`flex h-16 w-12 shrink-0 items-center justify-center active:opacity-50 ${
                      vendorOf(item.id) ? 'text-brand' : 'text-[#c7c7cc]'
                    }`}
                    aria-label={vendorOf(item.id) ? `Done by ${vendorOf(item.id)!.name}. Change` : 'Assign to someone'}
                  >
                    <PersonIcon size={18} strokeWidth={vendorOf(item.id) ? 2.4 : 2} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
      {cycle.error && <ErrorNote error={cycle.error} />}
      {assigning && (
        <AssignSheet item={assigning} assignment={vendorOf(assigning.id)} onClose={() => setAssigning(null)} />
      )}

      <Link
        to={`/jobs/${job.id}/items/new`}
        className="mt-3 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand-soft text-[17px] font-semibold text-brand-dark transition active:opacity-70"
      >
        <PlusIcon size={22} strokeWidth={2.6} />
        Add punch list item
      </Link>

      <SectionTitle>{lead ? 'This lead' : 'This job'}</SectionTitle>
      {lead ? (
        <>
          <Card>
            <RowLink to={`/jobs/${job.id}/bill`} Icon={InvoiceIcon} title="Estimate" value={formatMoney(estimate)} />
            <Divider />
            <RowLink
              to={`/jobs/${job.id}/parts`}
              Icon={TagIcon}
              title="Parts"
              value={parts.length ? String(parts.length) : 'None'}
            />
          </Card>
          <LeadActions lead={job} />
        </>
      ) : partner ? (
        <Card>
          {myShare?.share_bring && (
            <>
              <RowLink
                to={`/jobs/${job.id}/bring`}
                Icon={ChecklistIcon}
                title="Bring list"
                value={bring.length ? `${packed} of ${bring.length} packed` : 'Empty'}
              />
              <Divider />
            </>
          )}
          {myShare?.share_parts && (
            <>
              <RowLink
                to={`/jobs/${job.id}/parts`}
                Icon={TagIcon}
                title="Parts to buy"
                value={parts.length ? `${parts.filter((p) => p.status === 'needed').length} needed` : 'None'}
              />
              <Divider />
            </>
          )}
          {myShare?.share_time && (
            <>
              <RowLink to={`/jobs/${job.id}/time`} Icon={ClockIcon} title="Time" value={formatDuration(onSite)} />
              <Divider />
            </>
          )}
          <RowLink to={`/jobs/${job.id}/report`} Icon={PhotosIcon} title="Before and after report" />
        </Card>
      ) : (
        <Card>
          <RowLink
            to={`/jobs/${job.id}/bring`}
            Icon={ChecklistIcon}
            title="Bring list"
            value={bring.length ? `${packed} of ${bring.length} packed` : 'Empty'}
          />
          <Divider />
          <RowLink
            to={`/jobs/${job.id}/parts`}
            Icon={TagIcon}
            title="Parts and orders"
            value={parts.length ? `${parts.length} · ${formatMoney(paid)} paid` : 'None'}
          />
          <Divider />
          <RowLink to={`/jobs/${job.id}/time`} Icon={ClockIcon} title="Time" value={formatDuration(onSite)} />
          <Divider />
          <RowLink
            to={`/jobs/${job.id}/bill`}
            Icon={InvoiceIcon}
            title={invoice ? `Invoice #${invoice.number}` : 'Estimate'}
            value={billValue}
          />
          <Divider />
          <RowLink to={`/jobs/${job.id}/report`} Icon={PhotosIcon} title="Before and after report" />
        </Card>
      )}
    </Screen>
  )
}

function ActionButton({
  href,
  onClick,
  label,
  Icon,
  newTab,
}: {
  href?: string
  onClick?: () => void
  label: string
  Icon: typeof PhoneIcon
  newTab?: boolean
}) {
  const content = (
    <>
      <Icon size={24} />
      <span>{label}</span>
    </>
  )
  const base = 'flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl text-[15px] font-semibold'
  const active = `${base} bg-card text-brand transition active:scale-[0.97] active:bg-brand-soft`
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={active}>
        {content}
      </button>
    )
  }
  if (!href) {
    return <span className={`${base} bg-card text-[#c7c7cc]`}>{content}</span>
  }
  return (
    <a href={href} target={newTab ? '_blank' : undefined} rel={newTab ? 'noreferrer' : undefined} className={active}>
      {content}
    </a>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="whitespace-pre-wrap text-[17px]">{value}</p>
    </div>
  )
}
