import { createPortal } from "react-dom";
import { CloseIcon, LinkIcon } from "./Icons";

/** A photo full screen; tap anywhere to close */
export function PhotoViewer({
  url,
  caption,
  link,
  onClose,
}: {
  url: string;
  caption?: string;
  /** A store page to open from here */
  link?: string;
  onClose: () => void;
}) {
  return createPortal(
    <div
      role="dialog"
      aria-label={caption ?? "Photo"}
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-black/90 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
    >
      <div className="flex items-center px-2">
        <p className="min-w-0 flex-1 truncate px-2 text-[17px] font-semibold text-white">
          {caption}
        </p>
        <button
          onClick={onClose}
          className="flex h-12 w-12 items-center justify-center text-white"
          aria-label="Close"
        >
          <CloseIcon size={24} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <img
          src={url}
          alt={caption ?? ""}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      </div>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mx-4 mb-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white text-[16px] font-semibold text-[#0f172a]"
        >
          <LinkIcon size={18} /> Open the store page
        </a>
      )}
    </div>,
    document.body,
  );
}
