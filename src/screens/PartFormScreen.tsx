import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Screen } from "../components/Screen";
import {
  Button,
  Card,
  Divider,
  ErrorNote,
  Field,
  GroupLabel,
  Loading,
  Segmented,
} from "../components/ui";
import { partStatusLabels } from "../components/PartRow";
import { backend } from "../data/backend";
import { formatMoney, partsMarkup, withMarkup } from "../data/billing";
import {
  refreshAll,
  useAssignments,
  useItems,
  useJob,
  usePart,
  usePartPictures,
  useSettings,
} from "../data/queries";
import { CameraIcon, LinkIcon } from "../components/Icons";
import { shrinkPhoto } from "../lib/images";
import type { PartStatus } from "../data/types";
import { isPartnerJob } from "../data/api";
import { useUser } from "../lib/auth";

interface Form {
  name: string;
  quantity: string;
  cost: string;
  supplier: string;
  status: PartStatus;
  item_id: string;
  /** On a vendor's item: does the vendor order it? (null = what the item says) */
  vendor_orders: boolean | null;
  /** A store link for the part */
  link: string;
}

const looksLikeLink = (s: string) => /^https?:\/\/\S+\.\S+/i.test(s.trim());

/** Add a part (/jobs/:jobId/parts/new?item=…) or edit one (/parts/:partId) */
export function PartFormScreen() {
  const { jobId: jobFromUrl, partId } = useParams();
  const [search] = useSearchParams();
  const editing = Boolean(partId);
  const { data: part, isLoading, error } = usePart(partId ?? "", editing);
  const jobId = jobFromUrl ?? part?.job_id ?? "";
  const { data: items = [] } = useItems(jobId);
  const { data: job } = useJob(jobId, Boolean(jobId));
  const { data: settings } = useSettings();
  // Adding a part to another company's job: no cost (only they set prices)
  const shared = job ? isPartnerJob(job, useUser()) : false;
  const navigate = useNavigate();
  const qc = useQueryClient();
  // The part's photo: a new one picked (saved with the part), or removed
  const [newPhoto, setNewPhoto] = useState<{ blob: Blob; url: string } | null>(
    null,
  );
  const [removePhoto, setRemovePhoto] = useState(false);
  const { data: pictures = {} } = usePartPictures(part ? [part] : []);
  // What a pasted store link said (name, price, store, picture)
  const [linkInfo, setLinkInfo] = useState<{
    url: string;
    loading?: boolean;
    error?: string;
    title?: string;
    site?: string;
    image?: string | null;
  } | null>(null);

  /** Read a store link and fill in whatever is still empty */
  async function lookUpLink(raw: string) {
    const url = raw.trim();
    if (!looksLikeLink(url)) return;
    setLinkInfo({ url, loading: true });
    try {
      const info = await backend.linkPreview(url);
      setLinkInfo({ url, ...info, image: info.image ?? info.imageUrl ?? null });
      setForm((f) => {
        if (!f) return f;
        const qty = parseFloat(f.quantity) > 0 ? parseFloat(f.quantity) : 1;
        return {
          ...f,
          name: f.name.trim() ? f.name : info.title,
          cost:
            f.cost.trim() || info.price == null
              ? f.cost
              : String(Math.round(info.price * qty * 100) / 100),
          supplier: f.supplier.trim() ? f.supplier : info.site,
        };
      });
      // Use the store's picture if the part has no photo of its own
      const hasOwn = part && pictures[part.id]?.own && !removePhoto;
      const picture = info.image ?? info.imageUrl;
      if (picture && !hasOwn) {
        try {
          const blob = await (await fetch(picture)).blob();
          const small = await shrinkPhoto(
            new File([blob], "store.jpg", { type: blob.type }),
          ).catch(() => blob);
          setNewPhoto((current) =>
            current ? current : { blob: small, url: URL.createObjectURL(small) },
          );
          setRemovePhoto(false);
        } catch {
          // The picture shows above but can't be saved; a screenshot still works
        }
      }
    } catch (e) {
      setLinkInfo({
        url,
        error:
          e instanceof Error
            ? e.message
            : "Could not read that link. The link is still saved.",
      });
    }
  }
  const [form, setForm] = useState<Form | null>(
    editing
      ? null
      : {
          name: "",
          quantity: "1",
          cost: "",
          supplier: "",
          status: "needed",
          item_id: search.get("item") ?? "",
          vendor_orders: null,
          link: "",
        },
  );

  useEffect(() => {
    if (part && !form) {
      setForm({
        name: part.name,
        quantity: String(part.quantity),
        cost: part.cost == null ? "" : String(part.cost),
        supplier: part.supplier,
        status: part.status,
        item_id: part.item_id ?? "",
        vendor_orders: part.vendor_orders ?? false,
        link: part.link ?? "",
      });
    }
  }, [part, form]);

  // Items given to vendors (not on another company's job)
  const { data: assignments = [] } = useAssignments(
    jobId,
    Boolean(jobId) && !shared,
  );
  const assignmentFor = (itemId: string) =>
    assignments.find((x) => x.id === itemId);
  const vendorOrdersFor = (f: Form) => {
    const a = assignmentFor(f.item_id);
    return a ? (f.vendor_orders ?? a.materials_by === "vendor") : false;
  };

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const cost = parseFloat(f.cost);
      const input = {
        job_id: jobId,
        item_id: f.item_id || null,
        name: f.name.trim(),
        quantity: parseFloat(f.quantity) > 0 ? parseFloat(f.quantity) : 1,
        cost: Number.isFinite(cost) ? cost : null,
        supplier: f.supplier.trim(),
        status: f.status,
        vendor_orders: vendorOrdersFor(f),
      };
      if (shared) return backend.addSharedPart(input);
      const saved = part
        ? await backend.updatePart(part, input)
        : await backend.createPart(input);
      const link = f.link.trim();
      if (link !== (part?.link ?? ""))
        await backend.setPartLink(saved, link || null);
      if (newPhoto)
        await backend.setPartPhoto(
          { ...saved, photo_path: part?.photo_path ?? null },
          newPhoto.blob,
        );
      else if (removePhoto && part?.photo_path)
        await backend.setPartPhoto(part, null);
      return saved;
    },
    onSuccess: () => {
      void refreshAll(qc);
      navigate(-1);
    },
  });

  const remove = useMutation({
    mutationFn: () => backend.deletePart(partId!),
    onSuccess: () => {
      void refreshAll(qc);
      navigate(-1);
    },
  });

  const back = {
    to: jobId ? `/jobs/${jobId}/parts` : "/orders",
    label: "Back",
  };
  if (editing && (isLoading || error || !form)) {
    return (
      <Screen title="Part" back={back}>
        {error ? <ErrorNote error={error} /> : <Loading />}
      </Screen>
    );
  }
  if (!form) return null;

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const assignment = assignmentFor(form.item_id);
  const vendorOrders = vendorOrdersFor(form);
  const costNumber = parseFloat(form.cost);

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(form!);
  }

  return (
    <Screen title={editing ? "Edit part" : "New part"} back={back}>
      <form onSubmit={submit} className="space-y-6">
        {assignment && (
          <section>
            <GroupLabel>Who orders it</GroupLabel>
            <Segmented
              label="Who orders it"
              value={vendorOrders ? "vendor" : "me"}
              onChange={(v) => set({ vendor_orders: v === "vendor" })}
              options={[
                { value: "me", label: "Me" },
                { value: "vendor", label: assignment.name },
              ]}
            />
            {vendorOrders && (
              <p className="mt-1.5 px-4 text-[13px] text-muted">
                Stays off your orders list and your bill, but shows on the item.
              </p>
            )}
          </section>
        )}
        {!shared && !vendorOrders && (
          <Segmented
            label="Order status"
            value={form.status}
            onChange={(status) => set({ status })}
            options={(["needed", "ordered", "received"] as const).map((v) => ({
              value: v,
              label: partStatusLabels[v],
            }))}
          />
        )}
        {!shared && (
          <section>
            <GroupLabel>Store link (optional)</GroupLabel>
            <Card>
              <div className="flex items-center">
                <Field
                  label="Paste a link to the part"
                  type="url"
                  inputMode="url"
                  className="min-w-0 flex-1"
                  value={form.link}
                  placeholder="https://…"
                  aria-label="Store link"
                  onChange={(e) => set({ link: e.target.value })}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (looksLikeLink(text)) {
                      e.preventDefault();
                      set({ link: text.trim() });
                      void lookUpLink(text);
                    }
                  }}
                  onBlur={() => {
                    if (
                      form.link.trim() !== (linkInfo?.url ?? part?.link ?? "")
                    )
                      void lookUpLink(form.link);
                  }}
                />
                <button
                  type="button"
                  className="mr-3 min-h-11 shrink-0 rounded-xl bg-sky-soft px-4 text-[15px] font-semibold text-sky active:opacity-70"
                  onClick={async () => {
                    let text = "";
                    try {
                      text = (await navigator.clipboard.readText()).trim();
                    } catch {
                      // no clipboard access: they can paste into the box
                    }
                    if (looksLikeLink(text)) {
                      set({ link: text });
                      void lookUpLink(text);
                    } else if (looksLikeLink(form.link)) {
                      void lookUpLink(form.link);
                    } else {
                      setLinkInfo({
                        url: "",
                        error:
                          "Copy the part's link in the store's app or website, then tap Paste.",
                      });
                    }
                  }}
                >
                  Paste
                </button>
              </div>
              {linkInfo &&
                (linkInfo.loading || linkInfo.error || linkInfo.title) && (
                  <>
                    <Divider />
                    <div className="flex items-center gap-3 px-4 py-3">
                      {linkInfo.image ? (
                        <img
                          src={linkInfo.image}
                          alt="From the store"
                          className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-black/10"
                        />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted">
                          <LinkIcon size={22} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        {linkInfo.loading ? (
                          <p className="text-[15px] text-muted">
                            Reading the store page…
                          </p>
                        ) : linkInfo.error ? (
                          <p className="text-[14px] text-problem">
                            {linkInfo.error}
                          </p>
                        ) : (
                          <>
                            <p className="line-clamp-2 text-[15px] font-medium">
                              {linkInfo.title}
                            </p>
                            <p className="text-[13px] text-muted">
                              {linkInfo.site} · filled in the empty boxes below
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              {looksLikeLink(form.link) && !linkInfo?.loading && (
                <a
                  href={form.link.trim()}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center gap-2 border-t border-hairline px-4 text-[15px] font-semibold text-sky"
                >
                  <LinkIcon size={18} /> Open the store page
                </a>
              )}
            </Card>
          </section>
        )}
        <Card>
          <Field
            label="Part"
            required
            autoFocus={!editing}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Moen 1225 cartridge"
          />
          <Divider />
          <div className={shared ? "" : "grid grid-cols-2"}>
            <Field
              label="Quantity"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) =>
                set({ quantity: e.target.value.replace(/[^\d.]/g, "") })
              }
            />
            {!shared && (
              <Field
                label="Cost paid (total) $"
                inputMode="decimal"
                value={form.cost}
                onChange={(e) =>
                  set({ cost: e.target.value.replace(/[^\d.]/g, "") })
                }
                placeholder="0.00"
                className="border-l border-hairline"
              />
            )}
          </div>
          <Divider />
          <Field
            label="Supplier (optional)"
            value={form.supplier}
            onChange={(e) => set({ supplier: e.target.value })}
            placeholder="e.g. Home Depot"
          />
        </Card>
        {!shared && (
          <section>
            <GroupLabel>Photo of the part</GroupLabel>
            <Card className="p-3">
              {(() => {
                const current =
                  newPhoto?.url ??
                  (removePhoto ? undefined : pictures[part?.id ?? ""]?.url);
                const fromItem =
                  !newPhoto &&
                  !removePhoto &&
                  part &&
                  pictures[part.id] &&
                  !pictures[part.id].own;
                return (
                  <div className="flex items-center gap-3">
                    {current ? (
                      <img
                        src={current}
                        alt="The part"
                        className="h-24 w-24 shrink-0 rounded-xl object-cover ring-1 ring-black/10"
                      />
                    ) : (
                      <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
                        <CameraIcon size={28} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-soft px-3 text-[15px] font-semibold text-sky active:opacity-70">
                        <CameraIcon size={20} />
                        {current && !fromItem ? "Change photo" : "Add a photo"}
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          aria-label="Photo of the part"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file) return;
                            const blob = await shrinkPhoto(file);
                            setNewPhoto({
                              blob,
                              url: URL.createObjectURL(blob),
                            });
                            setRemovePhoto(false);
                          }}
                        />
                      </label>
                      {current && !fromItem && (
                        <button
                          type="button"
                          className="min-h-10 w-full text-[15px] font-semibold text-problem"
                          onClick={() => {
                            setNewPhoto(null);
                            setRemovePhoto(true);
                          }}
                        >
                          Remove photo
                        </button>
                      )}
                      <p className="text-[13px] text-muted">
                        {fromItem
                          ? "Showing the punch list item’s photo. Add one of the part itself, or a screenshot from the store."
                          : "A picture of the part or a screenshot from the store, so you buy the right one."}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </Card>
          </section>
        )}
        {!shared &&
          settings &&
          Number.isFinite(costNumber) &&
          costNumber > 0 &&
          partsMarkup(settings, job) > 0 && (
            <p className="-mt-3 px-4 text-[14px] text-muted">
              Customer pays{" "}
              {formatMoney(withMarkup(costNumber, partsMarkup(settings, job)))}{" "}
              with your {partsMarkup(settings, job)}% markup.
            </p>
          )}

        {items.length > 0 && (
          <section>
            <GroupLabel>For which item?</GroupLabel>
            <Card>
              <label className="block px-4 py-2.5">
                <select
                  value={form.item_id}
                  onChange={(e) => set({ item_id: e.target.value })}
                  className="min-h-10 w-full bg-transparent outline-none"
                >
                  <option value="">Whole job (no specific item)</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                      {i.location ? ` (${i.location})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </Card>
          </section>
        )}

        {save.error && <ErrorNote error={save.error} />}
        <Button type="submit" disabled={save.isPending || !form.name.trim()}>
          {save.isPending ? "Saving…" : editing ? "Save part" : "Add part"}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="danger"
            disabled={remove.isPending}
            onClick={() => confirm("Delete this part?") && remove.mutate()}
          >
            Delete part
          </Button>
        )}
      </form>
    </Screen>
  );
}
