import { Check, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { zhCN } from "@/locales/zh-CN";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SidebarNameFormProps {
  readonly error: string | null;
  readonly initialValue?: string;
  readonly label: string;
  readonly pending: boolean;
  readonly placeholder: string;
  readonly onCancel: () => void;
  readonly onSubmit: (value: string) => void;
}

export function SidebarNameForm({
  error,
  initialValue = "",
  label,
  pending,
  placeholder,
  onCancel,
  onSubmit
}: SidebarNameFormProps) {
  const inputId = useId();
  const [value, setValue] = useState(initialValue);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value.trim());
  }

  return (
    <form
      className="@container min-w-0 px-2 py-1"
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-1 @[240px]:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          id={inputId}
          className="h-8 w-full px-2"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          maxLength={200}
          autoFocus
          required
          disabled={pending}
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="flex shrink-0 items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            type="submit"
            className="size-8 text-secondary-foreground"
            aria-label={label}
            disabled={pending || value.trim().length === 0}
          >
            <Check className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            className="size-8 text-muted-foreground"
            onClick={onCancel}
            aria-label={zhCN.workspaceSidebar.cancel}
            disabled={pending}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {error === null ? null : (
        <p className="m-0 mt-1.5 text-xs leading-4 text-destructive [overflow-wrap:anywhere]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
