import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Banner, Button, IconButton } from "../ui/base";

// Main content plus an optional side panel (transcript, chat). Below the panel breakpoint the panel overlays.
export function WithPanel({ panel, children }: { panel?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex h-full">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      {panel}
    </div>
  );
}

export function SidePanel({ title, status, onClose, children, footer }: { title: string; status?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <aside aria-label={title} className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[var(--panel)] flex-col border-l border-border bg-bg shadow-pop panel:static panel:shadow-none">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {status}
        <IconButton label={`Close ${title.toLowerCase()}`} onClick={onClose} className="ml-auto"><X className="size-4" aria-hidden /></IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      {footer && <div className="shrink-0 border-t border-border p-3">{footer}</div>}
    </aside>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[var(--content-max)] px-4 py-8 md:px-6">{children}</div>;
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Banner tone="error" action={<Button size="sm" onClick={onRetry}>Try again</Button>}>{message}</Banner>;
}
