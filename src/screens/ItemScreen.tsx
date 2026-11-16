import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CalendarIcon,
  ChecklistIcon,
  OrdersIcon,
  PencilIcon,
  PersonIcon,
  PlusIcon,
  RulerIcon,
  TextIcon,
} from "../components/Icons";
import { Fold, FoldList } from "../components/Fold";
import { clockLabel } from "../lib/dates";
import { ListEditor } from "../components/ListEditor";
import { MeasurementsEditor } from "../components/MeasurementsEditor";
import { PartRow } from "../components/PartRow";
import { PhotoStrip } from "../components/PhotoSection";
import { PlannedDay, dayLabel } from "../components/PlannedDay";
import { Screen } from "../components/Screen";
import { TaskTimer } from "../components/TimeWidgets";
import {
  Card,
  Divider,
  ErrorNote,
  Field,
  Loading,
  StatusPicker,
  TextArea,
} from "../components/ui";
import { backend } from "../data/backend";
import { isPartnerJob } from "../data/api";
import {
  keys,
  refreshAll,
  useAssignments,
  useItem,
  useJob,
  useMyShare,
  useParts,
  usePhotos,
  usePartPictures,
} from "../data/queries";
import { AssignSheet } from "../components/AssignSheet";
import { useUser } from "../lib/auth";
import { setPendingImage } from "../lib/pendingImage";
import type { ItemPatch, PunchItem } from "../data/types";

/** Like the item, but hours are kept as typed text until saved */
type Draft = Omit<Required<ItemPatch>, "estimated_hours"> & {
  estimated_hours: string;
};

const pickDraft = (i: PunchItem): Draft => ({
  title: i.title,
  location: i.location,
  notes: i.notes,
  status: i.status,
  measurements: i.measurements,
  tools: i.tools ?? [],
  estimated_hours: i.estimated_hours == null ? "" : String(i.estimated_hours),
  planned_date: i.planned_date ?? null,
  planned_time: i.planned_time ?? null,
});

/**
 * Everything about one punch list item. Changes save automatically
 * (like Apple Notes), so there is no Save button to forget.
 */
export function ItemScreen() {
  const { jobId = "", itemId = "" } = useParams();
  const { data: item, isLoading, error } = useItem(itemId);
  const { data: job } = useJob(jobId);
  // Another company's shared job: punch list and photos, plus parts and time if they shared them; never pricing
  const partner = job ? isPartnerJob(job, useUser()) : false;
  const { data: myShare } = useMyShare(jobId, partner);
  const showParts = !partner || Boolean(myShare?.share_parts);
  const showTime =
    (!partner || Boolean(myShare?.share_time)) && job?.stage !== "lead";
  const { data: parts = [] } = useParts(jobId, partner, Boolean(job));
  const { data: pictures = {} } = usePartPictures(parts);
  // Who is doing it, if not me (my company only)
  const { data: assignments = [] } = useAssignments(
    jobId,
    Boolean(job) && !partner,
  );
  const assignment = assignments.find((a) => a.id === itemId);
  const [assigning, setAssigning] = useState(false);
  const { data: photos = [] } = usePhotos(itemId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const { saveState, saveError, flush } = useAutosave(itemId, draft);

  useEffect(() => {
    if (item && !draft) setDraft(pickDraft(item));
  }, [item, draft]);

  const remove = useMutation({
    mutationFn: () => backend.deleteItem(itemId),
    onSuccess: () => {
      void refreshAll(qc);
      navigate(-1);
    },
  });

  const back = { to: `/jobs/${jobId}`, label: "Job" };
  if (isLoading || error || !draft) {
    return (
      <Screen title="Item" back={back}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const itemParts = parts.filter((p) => p.item_id === itemId);
  const neededParts = itemParts.filter(
    (p) => p.status === "needed" && !p.vendor_orders,
  ).length;

  return (
    <Screen
      title={draft.title || "Untitled item"}
      eyebrow={draft.location || undefined}
      back={back}
      action={<SaveIndicator state={saveState} />}
    >
      <StatusPicker
        value={draft.status}
        onChange={(status) => set({ status })}
      />
      {assignment && (
        <button
          onClick={() => setAssigning(true)}
          className="mt-3 flex min-h-12 w-full items-center gap-2 rounded-2xl bg-card px-4 text-left active:bg-canvas"
        >
          <PersonIcon
            size={18}
            className="shrink-0 text-brand"
            strokeWidth={2.4}
          />
          <span className="min-w-0 flex-1 truncate text-[15px]">
            <strong>{assignment.name}</strong> is doing this
            {assignment.paid_by === "client" ? " · client pays them" : ""}
          </span>
          <span className="text-[15px] font-semibold text-brand">Change</span>
        </button>
      )}
      {assigning && (
        <AssignSheet
          item={{ id: itemId, job_id: jobId, title: draft.title }}
          assignment={assignment}
          onClose={() => setAssigning(false)}
        />
      )}
      {showTime && (
        <div className="mt-3">
          <TaskTimer
            jobId={jobId}
            itemId={itemId}
            onStart={() =>
              setDraft((d) =>
                d && d.status === "todo" ? { ...d, status: "in_progress" } : d,
              )
            }
          />
        </div>
      )}

      <div className="mt-3">
        <PhotoStrip
          jobId={jobId}
          itemId={itemId}
          startOn={draft.status === "done" ? "after" : "before"}
        />
      </div>

      <div className="mt-3">
        <FoldList>
          <Fold
            id="item-details"
            icon={<PencilIcon size={17} />}
            tint="bg-teal-soft text-teal"
            title="Details"
            summary={
              [
                draft.location,
                draft.estimated_hours && !partner
                  ? `${draft.estimated_hours} h`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ") || "Where, how long"
            }
          >
            <Card>
              <Field
                label="What needs doing?"
                value={draft.title}
                onChange={(e) => set({ title: e.target.value })}
              />
              <Divider />
              <Field
                label="Where? (room or area)"
                value={draft.location}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="e.g. Upstairs bathroom"
              />
              {!partner && (
                <>
                  <Divider />
                  <Field
                    label="Expected time (hours), for the estimate"
                    inputMode="decimal"
                    value={draft.estimated_hours}
                    onChange={(e) =>
                      set({
                        estimated_hours: e.target.value.replace(/[^\d.]/g, ""),
                      })
                    }
                    placeholder="e.g. 1.5"
                  />
                </>
              )}
            </Card>
          </Fold>

          <Fold
            id="item-when"
            icon={<CalendarIcon size={17} />}
            tint="bg-sun-soft text-sun"
            title="When"
            summary={
              draft.planned_date ? (
                <span className="font-medium text-ink">
                  {dayLabel(draft.planned_date)}
                  {draft.planned_time
                    ? ` · ${clockLabel(draft.planned_time)}`
                    : ""}
                </span>
              ) : (
                "Not planned"
              )
            }
          >
            <PlannedDay
              jobId={jobId}
              itemId={itemId}
              value={draft.planned_date}
              time={draft.planned_time}
              onChange={(planned_date) =>
                set(
                  planned_date
                    ? { planned_date }
                    : { planned_date: null, planned_time: null },
                )
              }
              onTime={(planned_time) => set({ planned_time })}
            />
          </Fold>

          <Fold
            id="item-measurements"
            icon={<RulerIcon size={17} />}
            tint="bg-grape-soft text-grape"
            title="Measurements"
            summary={
              draft.measurements.length
                ? `${draft.measurements.length}`
                : "None"
            }
          >
            <MeasurementsEditor
              value={draft.measurements}
              onChange={(measurements) => set({ measurements })}
              photoUrl={(id) => photos.find((p) => p.id === id)?.url}
              onAddPhoto={(m, file) => {
                // The measurement is saved on the way out; the photo goes straight to the drawing screen
                setPendingImage(file);
                void flush().then(() =>
                  navigate(
                    `/jobs/${jobId}/items/${itemId}/sketch?measurement=${m.id}&fromFile=1`,
                  ),
                );
              }}
              onOpenPhoto={(m) =>
                navigate(
                  `/jobs/${jobId}/items/${itemId}/sketch?measurement=${m.id}&photo=${m.photo_id}`,
                )
              }
            />
          </Fold>

          {showParts && (
            <Fold
              id="item-parts"
              icon={<OrdersIcon size={17} />}
              tint="bg-sky-soft text-sky"
              title="Parts"
              summary={
                itemParts.length === 0 ? (
                  "None"
                ) : neededParts > 0 ? (
                  <span className="font-medium text-problem">
                    {neededParts} to order
                  </span>
                ) : (
                  `${itemParts.length}`
                )
              }
            >
              {itemParts.length > 0 && (
                <Card className="mb-2">
                  {itemParts.map((p, i) => (
                    <div key={p.id}>
                      {i > 0 && <Divider />}
                      <PartRow
                        part={p}
                        picture={
                          pictures[p.id]?.own ? pictures[p.id] : undefined
                        }
                        shared={partner}
                        vendorName={assignment?.name}
                      />
                    </div>
                  ))}
                </Card>
              )}
              <Link
                to={`/jobs/${jobId}/parts/new?item=${itemId}`}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-[#c7c7cc] text-[16px] font-semibold text-brand active:bg-white"
              >
                <PlusIcon size={20} />
                Add part
              </Link>
            </Fold>
          )}

          <Fold
            id="item-tools"
            icon={<ChecklistIcon size={17} />}
            tint="bg-rose-soft text-rose"
            title="Tools & materials"
            summary={draft.tools.length ? `${draft.tools.length}` : "None"}
          >
            <ListEditor
              value={draft.tools}
              onChange={(tools) => set({ tools })}
              placeholder="e.g. Drill, 1/4in bit, wall anchors x8"
            />
            <p className="mt-1.5 px-2 text-[13px] text-muted">
              These go on the job's bring list automatically.
            </p>
          </Fold>

          <Fold
            id="item-notes"
            icon={<TextIcon size={17} />}
            tint="bg-brand-soft text-brand-dark"
            title="Notes"
            summary={
              draft.notes.trim() ? draft.notes.trim().split("\n")[0] : "None"
            }
          >
            <Card>
              <TextArea
                value={draft.notes}
                onChange={(e) => set({ notes: e.target.value })}
                rows={5}
                placeholder="What you saw, what the customer asked for, how you plan to fix it…"
              />
            </Card>
          </Fold>
        </FoldList>
      </div>

      {Boolean(saveError) && (
        <div className="mt-4">
          <ErrorNote error={saveError} />
        </div>
      )}

      <div className="mt-8 text-center">
        <button
          type="button"
          disabled={remove.isPending}
          onClick={() =>
            confirm(
              "Delete this item, its photos and its timers? This cannot be undone.",
            ) && remove.mutate()
          }
          className="min-h-11 px-4 text-[15px] font-medium text-problem active:opacity-60 disabled:opacity-40"
        >
          {remove.isPending ? "Deleting…" : "Delete item"}
        </button>
        {remove.error && <ErrorNote error={remove.error} />}
      </div>
    </Screen>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** Saves the draft about half a second after the last change, and right away when leaving the screen. */
function useAutosave(itemId: string, draft: Draft | null) {
  const qc = useQueryClient();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<unknown>(null);
  const lastSaved = useRef<string | null>(null);
  const pending = useRef<Draft | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = useRef(async () => {});
  flush.current = async () => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    const snapshot = JSON.stringify(next);
    setSaveState("saving");
    try {
      const hours = parseFloat(next.estimated_hours);
      // Only send the planned day when it changed (works before the database update too)
      const prev = lastSaved.current
        ? (JSON.parse(lastSaved.current) as Draft)
        : null;
      const before = prev?.planned_date ?? null;
      const beforeTime = prev?.planned_time ?? null;
      const { planned_date, planned_time, ...rest } = next;
      const saved = await backend.updateItem(itemId, {
        ...rest,
        ...(planned_date !== before ? { planned_date } : {}),
        ...(planned_time !== beforeTime ? { planned_time } : {}),
        title: next.title.trim() || "Untitled item",
        estimated_hours: Number.isFinite(hours) ? hours : null,
      });
      lastSaved.current = snapshot;
      qc.setQueryData(keys.item(itemId), saved);
      void refreshAll(qc);
      setSaveError(null);
      setSaveState("saved");
    } catch (err) {
      setSaveError(err);
      setSaveState("error");
    }
  };

  useEffect(() => {
    if (!draft) return;
    const snapshot = JSON.stringify(draft);
    if (lastSaved.current === null) {
      lastSaved.current = snapshot; // first load: nothing to save yet
      return;
    }
    if (snapshot === lastSaved.current) return;
    pending.current = draft;
    window.clearTimeout(timer.current);
    // Status taps save at once; typing waits for a short pause
    const statusChanged =
      (JSON.parse(lastSaved.current) as Draft).status !== draft.status;
    timer.current = window.setTimeout(
      () => void flush.current(),
      statusChanged ? 0 : 600,
    );
  }, [draft]);

  useEffect(() => {
    const onHide = () =>
      document.visibilityState === "hidden" && void flush.current();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void flush.current();
    };
  }, []);

  return { saveState, saveError, flush: () => flush.current() };
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    error: "Not saved",
  }[state];
  return (
    <span
      className={`text-[15px] font-medium transition-opacity ${state === "error" ? "text-problem" : "text-muted"} ${
        state === "idle" ? "opacity-0" : "opacity-100"
      }`}
      aria-live="polite"
    >
      {text}
    </span>
  );
}
