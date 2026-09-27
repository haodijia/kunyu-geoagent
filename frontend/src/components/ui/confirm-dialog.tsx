import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly pending: boolean;
  readonly ready: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <AlertDialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !props.pending) props.onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[400px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
          <AlertDialog.Title className="m-0 text-base font-semibold">
            {props.title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-3 text-sm leading-6 text-slate-500">
            {props.description}
          </AlertDialog.Description>
          {props.error && (
            <p role="alert" className="text-sm text-red-600">
              {props.error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button
                variant="outline"
                className="rounded-full"
                disabled={props.pending}
              >
                {zhCN.workspaceSidebar.cancel}
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant="outline"
              className="rounded-full border-red-300 text-red-600 hover:bg-red-50"
              disabled={props.pending || !props.ready}
              onClick={props.onConfirm}
            >
              {props.pending
                ? zhCN.workspaceSidebar.processing
                : props.confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
