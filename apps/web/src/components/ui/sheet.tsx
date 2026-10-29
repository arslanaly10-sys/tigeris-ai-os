import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Side sheet that opens from the inline-end edge (mirrors automatically in RTL). */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = 'end',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  side?: 'start' | 'end';
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/40" />
        <Dialog.Content
          className={cn(
            'fixed inset-y-0 z-50 flex w-full max-w-lg flex-col bg-paper shadow-xl outline-none',
            side === 'end' ? 'end-0 border-s border-line' : 'start-0 border-e border-line',
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="font-serif text-lg font-semibold text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-ink-muted">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="rounded-md p-1.5 text-ink-muted hover:bg-navy-100 hover:text-ink"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
