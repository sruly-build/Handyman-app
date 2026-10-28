import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ChecklistIcon,
  ChevronIcon,
  ClockIcon,
  DirectionsIcon,
  InvoiceIcon,
  PhoneIcon,
  PhotosIcon,
  PeopleIcon,
  PlusIcon,
  TagIcon,
} from '../components/Icons'
import { Screen } from '../components/Screen'
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
  useShares,
  useTime,
} from '../data/queries'
import { formatDuration, totalMs } from '../data/time'
import type { ItemStatus, PunchItem } from '../data/types'
import { isPartnerJob } from '../data/api'
import { useUser } from '../lib/auth'
import { friendlyDate } from '../lib/dates'
import { directionsLink, phoneLink } from '../lib/links'

const nextStatus: Record<ItemStatus, ItemStatus> = { todo: 'in_progress', in_progress: 'done', done: 'todo' }

export function JobDetailScreen() {
  const { jobId = '' } = useParams()
  const { data: job, isLoading, error } = useJob(jobId)
  const { data: items } = useItems(jobId)
  const { data: parts = [] } = useParts(jobId)
  const { data: checks = [] } = useBringChecks(jobId)
  const { data: entries = [] } = useTime(jobId)
  const { data: settings } = useSettings()
  const { data: invoice } = useInvoice(jobId)
  const { data: charges = [] } = useCharges(jobId)
  const { data: payments = [] } = usePayments(jobId)
  const user = useUser()
  const navigate = useNavigate()
  const qc = useQueryClient()
  // Another company's job shared with us: we only get the punch list and photos
  const partner = job ? isPartnerJob(job, user) : false
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

  const back = { to: '/jobs', label: 'Jobs' }
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
  const onSite = totalMs(entries.filter((e) => e.kind === 'visit'), Date.now())
  const estimate = settings
    ? buildBill({ items: items ?? [], parts, entries, settings, job, charges, now: Date.now() }, 'estimate').total
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
      eyebrow={friendlyDate(job.job_date)}
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

      <div className="grid grid-cols-2 gap-3">
        <ActionButton href={job.customer_phone ? phoneLink(job.customer_phone) : undefined} label="Call" Icon={PhoneIcon} />
        <ActionButton
          href={job.address ? directionsLink(job.address) : undefined}
          label="Directions"
          Icon={DirectionsIcon}
          newTab
        />
      </div>

      {(job.customer_phone || job.customer_email || job.notes) && (
        <Card className="mt-4">
          {job.customer_phone && <InfoRow label="Phone" value={job.customer_phone} />}
          {job.customer_phone && (job.customer_email || job.notes) && <Divider />}
          {job.customer_email && <InfoRow label="Email" value={job.customer_email} />}
          {job.customer_email && job.notes && <Divider />}
          {job.notes && <InfoRow label="Notes" value={job.notes} />}
        </Card>
      )}

      {partner ? (
        <div className="mt-4 rounded-2xl bg-brand-soft px-4 py-3 text-[15px] text-brand-dark">
          <p className="flex items-center gap-2">
            <PeopleIcon size={18} className="shrink-0" />
            <span>
              <strong>{ownerCompany?.name || 'Another company'}</strong> shared this job with you.
            </span>
          </p>
          <p className="mt-1 text-[14px]">You can work on the punch list and photos. Their prices, parts, time and bills stay private.</p>
          <button
            onClick={() => confirm('Remove this job from your list? They can share it again later.') && leave.mutate()}
            className="mt-2 min-h-11 text-[15px] font-semibold text-problem active:opacity-50"
          >
            Remove from my list
          </button>
          {leave.error && <ErrorNote error={leave.error} />}
        </div>
      ) : (
        <Card className="mt-4">
          <RowLink
            to={`/jobs/${job.id}/share`}
            Icon={PeopleIcon}
            title="Share with another company"
            value={shares.length ? shares.map((s) => s.company_name).join(', ') : 'Not shared'}
          />
        </Card>
      )}

      {!partner && (
        <>
          <SectionTitle>Time</SectionTitle>
          <ClockCard jobId={job.id} />
        </>
      )}

      <SectionTitle
        action={total > 0 && <span className="pb-0.5 text-[15px] font-semibold text-muted">{done} of {total} done</span>}
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
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-2 py-3 pr-4 active:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[17px] font-medium leading-snug ${item.status === 'done' ? 'text-muted line-through decoration-[#c7c7cc]' : ''}`}
                    >
                      {item.title}
                    </p>
                    {item.location && <p className="truncate text-[14px] text-muted">{item.location}</p>}
                  </div>
                  <ChevronIcon size={20} className="shrink-0 text-[#c7c7cc]" />
                </Link>
              </div>
            </div>
          ))}
        </Card>
      )}
      {cycle.error && <ErrorNote error={cycle.error} />}

      <Link
        to={`/jobs/${job.id}/items/new`}
        className="mt-3 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand-soft text-[17px] font-semibold text-brand-dark transition active:opacity-70"
      >
        <PlusIcon size={22} strokeWidth={2.6} />
        Add punch list item
      </Link>

      <SectionTitle>This job</SectionTitle>
      {partner ? (
        <Card>
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
  label,
  Icon,
  newTab,
}: {
  href?: string
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
  if (!href) {
    return <span className={`${base} bg-card text-[#c7c7cc]`}>{content}</span>
  }
  return (
    <a
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noreferrer' : undefined}
      className={`${base} bg-card text-brand transition active:scale-[0.97] active:bg-brand-soft`}
    >
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
