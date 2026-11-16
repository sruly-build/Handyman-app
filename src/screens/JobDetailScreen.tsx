import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  TagIcon,
} from "../components/Icons";
import { Screen } from "../components/Screen";
import { Fold, FoldList } from "../components/Fold";
import { TextClientSheet } from "../components/TextClient";
import { AssignSheet } from "../components/AssignSheet";
import { ClockCard } from "../components/TimeWidgets";
import {
  Card,
  Divider,
  EmptyState,
  ErrorNote,
  Loading,
  RowLink,
  StatusDot,
} from "../components/ui";
import { backend } from "../data/backend";
import { buildBill, formatMoney, paymentSummary } from "../data/billing";
import { buildBringList } from "../data/bring";
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
} from "../data/queries";
import { formatDuration, totalMs } from "../data/time";
import type { ItemStatus, PunchItem } from "../data/types";
import { isLead, isPartnerJob } from "../data/api";
import { isMine } from "../data/directory";
import { LeadActions, LeadPanel } from "../components/LeadPanel";
import { JobPlanPanel, TurnoverChecklistButton } from "../components/Plan";
import { dayLabel } from "../components/PlannedDay";
import { useUser } from "../lib/auth";
import { clockLabel, friendlyDate } from "../lib/dates";
import { directionsLink, phoneLink } from "../lib/links";

const nextStatus: Record<ItemStatus, ItemStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

export function JobDetailScreen() {
  const { jobId = "" } = useParams();
  const { data: job, isLoading, error } = useJob(jobId);
  const { data: items } = useItems(jobId);
  const user = useUser();
  // Another company's job shared with us: punch list and photos, plus what they chose to share
  const partner = job ? isPartnerJob(job, user) : false;
  const { data: myShare } = useMyShare(jobId, partner);
  const { data: parts = [] } = useParts(jobId, partner, Boolean(job));
  const { data: checks = [] } = useBringChecks(jobId);
  const { data: entries = [] } = useTime(jobId);
  const { data: settings } = useSettings();
  const { data: invoice } = useInvoice(jobId);
  const { data: charges = [] } = useCharges(jobId);
  const { data: payments = [] } = usePayments(jobId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: contacts = [] } = useContacts();
  // Only when the client is in my own directory (the job may have been made by someone else)
  const client = contacts.find(
    (c) => c.id === job?.client_id && isMine(c, user),
  );
  const [texting, setTexting] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [assigning, setAssigning] = useState<PunchItem | null>(null);
  // Items given to vendors (my company only; never for a shared job)
  const { data: assignments = [] } = useAssignments(
    jobId,
    Boolean(job) && !(job && isPartnerJob(job, user)),
  );
  const vendorOf = (itemId: string) => assignments.find((a) => a.id === itemId);
  const { data: ownerCompany } = useCompany(job?.company_id, partner);
  const { data: shares = [] } = useShares(jobId, Boolean(job) && !partner);

  const leave = useMutation({
    mutationFn: () => backend.unshareJob(jobId, user.companyId),
    onSuccess: () => {
      void refreshAll(qc);
      navigate("/jobs", { replace: true });
    },
  });

  // Tapping the circle moves an item along: to do → in progress → done
  const cycle = useMutation({
    mutationFn: (item: PunchItem) =>
      backend.updateItem(item.id, { status: nextStatus[item.status] }),
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: keys.items(jobId) });
      qc.setQueryData<PunchItem[]>(keys.items(jobId), (old) =>
        old?.map((i) =>
          i.id === item.id ? { ...i, status: nextStatus[item.status] } : i,
        ),
      );
    },
    onSettled: () => refreshAll(qc),
  });

  const lead = job ? isLead(job) : false;
  const back = lead
    ? { to: "/leads", label: "Turnovers" }
    : { to: "/jobs", label: "Jobs" };
  if (isLoading || error || !job) {
    return (
      <Screen title="Job" back={back}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    );
  }

  const done = items?.filter((i) => i.status === "done").length ?? 0;
  const total = items?.length ?? 0;
  // Done items drop to the bottom; the rest keep their order
  const listOrder = [...(items ?? [])].sort(
    (a, b) => Number(a.status === "done") - Number(b.status === "done"),
  );

  const bring = buildBringList(items ?? [], parts, job.bring_extras ?? []);
  const packed = bring.filter((b) =>
    checks.some((c) => c.key === b.key),
  ).length;
  const paid = parts
    .filter((p) => p.status !== "needed")
    .reduce((sum, p) => sum + (p.cost ?? 0), 0);
  const onSite = totalMs(
    entries.filter((e) => e.kind === "visit"),
    Date.now(),
  );
  const estimate = settings
    ? buildBill(
        {
          items: items ?? [],
          parts,
          entries,
          settings,
          job,
          charges,
          assignments,
          now: Date.now(),
        },
        "estimate",
      ).total
    : 0;
  const { balance } = paymentSummary(
    invoice ? Number(invoice.total) : 0,
    payments,
  );
  const billValue = !invoice
    ? formatMoney(estimate)
    : invoice.status === "paid"
      ? `${formatMoney(invoice.total)} · Paid`
      : balance < Number(invoice.total)
        ? `${formatMoney(balance)} due`
        : formatMoney(invoice.total);

  return (
    <Screen
      title={job.customer_name}
      hero={
        <div
          className={`shine mb-4 mt-1 rounded-[28px] bg-gradient-to-br px-5 py-5 text-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.35)] ${
            lead
              ? "from-[#7c3aed] via-[#8b5cf6] to-[#c084fc]"
              : partner
                ? "from-[#4338ca] via-[#6366f1] to-[#818cf8]"
                : "from-[#2563eb] via-[#3b82f6] to-[#06b6d4]"
          }`}
        >
          <p className="text-[13px] font-semibold uppercase tracking-wide text-white/80">
            {lead
              ? "Lead"
              : `${friendlyDate(job.job_date)}${job.job_date && job.job_time ? ` · ${clockLabel(job.job_time)}` : ""}`}
          </p>
          <h1 className="mt-0.5 text-[30px] font-bold leading-tight tracking-tight">
            {job.customer_name}
          </h1>
          {job.address && (
            <p className="mt-1 text-[16px] text-white/90">{job.address}</p>
          )}
          {(job.move_out_date || job.ready_by_date) && (
            <p className="mt-1.5 flex flex-wrap gap-x-3 text-[13px] font-medium text-white/85">
              {job.move_out_date && (
                <span>Moves out {friendlyDate(job.move_out_date)}</span>
              )}
              {job.ready_by_date && (
                <span>Ready by {friendlyDate(job.ready_by_date)}</span>
              )}
            </p>
          )}
          {total > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-mint"
                  style={{ width: `${Math.round((done / total) * 100)}%` }}
                />
              </div>
              <span className="text-[14px] font-semibold tabular-nums">
                {done}/{total} done
              </span>
            </div>
          )}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <HeroAction
              href={
                job.customer_phone ? phoneLink(job.customer_phone) : undefined
              }
              label="Call"
              Icon={PhoneIcon}
            />
            <HeroAction
              onClick={job.customer_phone ? () => setTexting(true) : undefined}
              label="Text"
              Icon={MessageIcon}
            />
            <HeroAction
              href={job.address ? directionsLink(job.address) : undefined}
              label="Directions"
              Icon={DirectionsIcon}
              newTab
            />
          </div>
        </div>
      }
      back={back}
      action={
        !partner && (
          <Link
            to={`/jobs/${job.id}/edit`}
            className="min-h-11 px-1 py-2 text-[17px] text-brand active:opacity-50"
          >
            Edit
          </Link>
        )
      }
    >
      {texting && (
        <TextClientSheet
          phone={job.customer_phone}
          customer={job.customer_name}
          onClose={() => setTexting(false)}
        />
      )}

      {lead && <LeadPanel lead={job} />}
      {lead && !isPartnerJob(job, user) && (
        <TurnoverChecklistButton job={job} />
      )}
      {!lead && job.property_id && !isPartnerJob(job, user) && (
        <JobPlanPanel job={job} />
      )}

      {(job.customer_email ||
        job.notes ||
        job.prospect_id ||
        (client && !lead)) && (
        <div className="mt-3">
          <FoldList>
            <Fold
              id="job-info"
              icon={<BookIcon size={17} />}
              tint="bg-teal-soft text-teal"
              title={lead ? "What they need" : "Notes & client"}
              summary={
                job.notes.trim()
                  ? job.notes.trim().split("\n")[0]
                  : job.customer_email || ""
              }
            >
              <Card>
                {job.notes && (
                  <InfoRow
                    label={lead ? "What they need" : "Notes"}
                    value={job.notes}
                  />
                )}
                {job.notes && (job.customer_phone || job.customer_email) && (
                  <Divider />
                )}
                {job.customer_phone && (
                  <InfoRow label="Phone" value={job.customer_phone} />
                )}
                {job.customer_phone && job.customer_email && <Divider />}
                {job.customer_email && (
                  <InfoRow label="Email" value={job.customer_email} />
                )}
              </Card>
              {client && !lead && (
                <Link
                  to={`/directory/${client.id}`}
                  className="mt-1 flex min-h-10 items-center gap-1.5 px-2 text-[14px] font-medium text-brand active:opacity-50"
                >
                  <BookIcon size={15} className="shrink-0" />
                  <span className="truncate">
                    Client history: all of {client.name.split(/\s+/)[0]}'s jobs
                    and payments
                  </span>
                </Link>
              )}
              {job.prospect_id && (
                <Link
                  to={`/sales/leads/${job.prospect_id}`}
                  className="flex min-h-10 items-center px-2 text-[14px] font-medium text-brand"
                >
                  Open the sales lead
                </Link>
              )}
            </Fold>
          </FoldList>
        </div>
      )}
      {leave.error && <ErrorNote error={leave.error} />}

      {!lead && (!partner || myShare?.share_time) && (
        <>
          <div className="mt-3">
            <ClockCard jobId={job.id} />
          </div>
        </>
      )}

      <h2 className="mb-2 mt-6 px-1 text-[13px] font-bold uppercase tracking-wide text-[color:var(--accent,#5f6a66)]">
        Punch list
      </h2>

      {items && items.length === 0 && (
        <EmptyState title="Nothing on the list yet">
          Add each thing that needs fixing as its own item.
        </EmptyState>
      )}

      {items && items.length > 0 && (
        <Card>
          {listOrder.map((item, idx) => (
            <div key={item.id}>
              {item.status === "done" &&
              (idx === 0 || listOrder[idx - 1].status !== "done") ? (
                <button
                  type="button"
                  onClick={() => setShowDone(!showDone)}
                  aria-expanded={showDone}
                  className={`flex min-h-11 w-full items-center gap-2 border-hairline bg-canvas/60 px-4 text-left text-[13px] font-bold uppercase tracking-wide text-brand-dark active:opacity-60 ${done < total ? "border-t" : ""} ${showDone ? "" : "rounded-b-2xl"} ${done === total ? "rounded-t-2xl" : ""}`}
                >
                  <ChevronIcon
                    size={14}
                    className={`transition-transform ${showDone ? "rotate-90" : ""}`}
                  />
                  Done ({done})
                  <span className="ml-auto font-medium normal-case tracking-normal text-muted">
                    {showDone ? "Hide" : "Show"}
                  </span>
                </button>
              ) : (
                idx > 0 && <Divider />
              )}
              <div
                className={`${item.status === "done" && !showDone ? "hidden" : "flex"} items-center ${item.status === "in_progress" ? "bg-progress-soft/60" : item.status === "done" ? "bg-brand-soft/40" : ""} ${idx === 0 ? "rounded-t-2xl" : ""} ${idx === listOrder.length - 1 ? "rounded-b-2xl" : ""}`}
              >
                <button
                  onClick={() => cycle.mutate(item)}
                  className="flex h-14 w-14 shrink-0 items-center justify-center active:opacity-50"
                  aria-label={`Status: ${item.status.replace("_", " ")}. Tap to change.`}
                >
                  <StatusDot status={item.status} />
                </button>
                <Link
                  to={`/jobs/${job.id}/items/${item.id}`}
                  className={`flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2.5 active:opacity-60 ${partner ? "pr-4" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[17px] font-medium leading-snug ${item.status === "done" ? "text-muted line-through decoration-[#c7c7cc]" : ""}`}
                    >
                      {item.title}
                    </p>
                    {(item.location ||
                      (item.planned_date && item.status !== "done")) && (
                      <p className="truncate text-[14px] text-muted">
                        {item.planned_date && item.status !== "done" && (
                          <span className="mr-1.5 rounded-full bg-[#e4eefb] px-2 py-0.5 text-[12px] font-semibold text-[#1f5fae]">
                            {dayLabel(item.planned_date)}
                            {item.planned_time
                              ? ` · ${clockLabel(item.planned_time)}`
                              : ""}
                          </span>
                        )}
                        {item.location}
                      </p>
                    )}
                    {vendorOf(item.id) && (
                      <p className="truncate text-[13px] font-medium text-brand-dark">
                        {vendorOf(item.id)!.name}
                      </p>
                    )}
                  </div>
                  {partner && (
                    <ChevronIcon
                      size={20}
                      className="shrink-0 text-[#c7c7cc]"
                    />
                  )}
                </Link>
                {/* Who is doing it: quiet grey until someone is assigned */}
                {!partner && (
                  <button
                    onClick={() => setAssigning(item)}
                    className={`flex h-14 w-12 shrink-0 items-center justify-center active:opacity-50 ${
                      vendorOf(item.id) ? "text-brand" : "text-[#c7c7cc]"
                    }`}
                    aria-label={
                      vendorOf(item.id)
                        ? `Done by ${vendorOf(item.id)!.name}. Change`
                        : "Assign to someone"
                    }
                  >
                    <PersonIcon
                      size={18}
                      strokeWidth={vendorOf(item.id) ? 2.4 : 2}
                    />
                  </button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
      {cycle.error && <ErrorNote error={cycle.error} />}
      {assigning && (
        <AssignSheet
          item={assigning}
          assignment={vendorOf(assigning.id)}
          onClose={() => setAssigning(null)}
        />
      )}

      <h2 className="mb-2 mt-6 px-1 text-[13px] font-bold uppercase tracking-wide text-[color:var(--accent,#5f6a66)]">
        {lead ? "This lead" : "This job"}
      </h2>
      {lead ? (
        <>
          <Card>
            <RowLink
              tone="bg-teal-soft text-teal"
              to={`/jobs/${job.id}/bill`}
              Icon={InvoiceIcon}
              title="Estimate"
              value={formatMoney(estimate)}
            />
            <Divider />
            <RowLink
              tone="bg-sun-soft text-sun"
              to={`/jobs/${job.id}/parts`}
              Icon={TagIcon}
              title="Parts"
              value={parts.length ? String(parts.length) : "None"}
            />
          </Card>
          <LeadActions lead={job} />
        </>
      ) : partner ? (
        <Card>
          {myShare?.share_bring && (
            <>
              <RowLink
                tone="bg-sky-soft text-sky"
                to={`/jobs/${job.id}/bring`}
                Icon={ChecklistIcon}
                title="Bring list"
                value={
                  bring.length ? `${packed} of ${bring.length} packed` : "Empty"
                }
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
                value={
                  parts.length
                    ? `${parts.filter((p) => p.status === "needed").length} needed`
                    : "None"
                }
              />
              <Divider />
            </>
          )}
          {myShare?.share_time && (
            <>
              <RowLink
                tone="bg-grape-soft text-grape"
                to={`/jobs/${job.id}/time`}
                Icon={ClockIcon}
                title="Time"
                value={formatDuration(onSite)}
              />
              <Divider />
            </>
          )}
          <RowLink
            tone="bg-rose-soft text-rose"
            to={`/jobs/${job.id}/report`}
            Icon={PhotosIcon}
            title="Before and after report"
          />
        </Card>
      ) : (
        <Card>
          <RowLink
            tone="bg-sky-soft text-sky"
            to={`/jobs/${job.id}/bring`}
            Icon={ChecklistIcon}
            title="Bring list"
            value={
              bring.length ? `${packed} of ${bring.length} packed` : "Empty"
            }
          />
          <Divider />
          <RowLink
            tone="bg-sun-soft text-sun"
            to={`/jobs/${job.id}/parts`}
            Icon={TagIcon}
            title="Parts and orders"
            value={
              parts.length
                ? `${parts.length} · ${formatMoney(paid)} paid`
                : "None"
            }
          />
          <Divider />
          <RowLink
            tone="bg-grape-soft text-grape"
            to={`/jobs/${job.id}/time`}
            Icon={ClockIcon}
            title="Time"
            value={formatDuration(onSite)}
          />
          <Divider />
          <RowLink
            tone="bg-teal-soft text-teal"
            to={`/jobs/${job.id}/bill`}
            Icon={InvoiceIcon}
            title={invoice ? `Invoice #${invoice.number}` : "Estimate"}
            value={billValue}
          />
          <Divider />
          <RowLink
            tone="bg-rose-soft text-rose"
            to={`/jobs/${job.id}/report`}
            Icon={PhotosIcon}
            title="Before and after report"
          />
          <Divider />
          <RowLink
            tone="bg-brand-soft text-brand-dark"
            to={`/jobs/${job.id}/share`}
            Icon={PeopleIcon}
            title="Share"
            value={
              shares.length
                ? shares.map((x) => x.company_name).join(", ")
                : "Not shared"
            }
          />
        </Card>
      )}
      {partner && (
        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 px-1 text-[13px] text-muted">
          <PeopleIcon size={14} className="shrink-0" />
          <span>Shared by {ownerCompany?.name || "another company"}</span>
          <span aria-hidden>·</span>
          <button
            onClick={() =>
              confirm(
                "Remove this job from your list? They can share it again later.",
              ) && leave.mutate()
            }
            className="min-h-8 text-muted underline active:opacity-50"
          >
            Remove from my list
          </button>
        </p>
      )}
    </Screen>
  );
}

/** A round quick button on the coloured job card */
function HeroAction({
  href,
  onClick,
  label,
  Icon,
  newTab,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  Icon: typeof PhoneIcon;
  newTab?: boolean;
}) {
  const cls =
    "flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white/20 text-[15px] font-semibold text-white backdrop-blur transition active:scale-[0.97] active:bg-white/30";
  const content = (
    <>
      <Icon size={18} />
      {label}
    </>
  );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    );
  if (!href) return <span className={`${cls} opacity-40`}>{content}</span>;
  return (
    <a
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
      className={cls}
    >
      {content}
    </a>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="whitespace-pre-wrap text-[17px]">{value}</p>
    </div>
  );
}
