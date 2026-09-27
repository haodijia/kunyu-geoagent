import { Check, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { zhCN } from "@/locales/zh-CN";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SidebarCreateFormProps {
  readonly error: string | null;
  readonly label: string;
  readonly pending: boolean;
  readonly placeholder: string;
  readonly onCancel: () => void;
  readonly onSubmit: (value: string) => void;
}

export function SidebarCreateForm({
  error,
  label,
  pending,
  placeholder,
  onCancel,
  onSubmit
}: SidebarCreateFormProps) {
  const inputId = useId();
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value.trim());
  }

  return (
    <form className="grid gap-1.5 px-2 py-1" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>
      <div className="flex items-center gap-1">
        <Input
          id={inputId}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          maxLength={200}
          autoFocus
          required
          disabled={pending}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          type="submit"
          className="flex size-8 items-center justify-center rounded-md text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          aria-label={label}
          disabled={pending || value.trim().length === 0}
        >
          <Check className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          onClick={onCancel}
          aria-label={zhCN.workspaceSidebar.cancel}
          disabled={pending}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {error === null ? null : (
        <p className="m-0 text-xs leading-4 text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
