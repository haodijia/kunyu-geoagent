import { Check, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { zhCN } from "@/locales/zh-CN";

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
        <input
          id={inputId}
          className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          maxLength={200}
          autoFocus
          required
          disabled={pending}
        />
        <button
          type="submit"
          className="flex size-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-40"
          aria-label={label}
          disabled={pending || value.trim().length === 0}
        >
          <Check className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-40"
          onClick={onCancel}
          aria-label={zhCN.workspaceSidebar.cancel}
          disabled={pending}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {error === null ? null : (
        <p className="m-0 text-xs leading-4 text-red-600" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
