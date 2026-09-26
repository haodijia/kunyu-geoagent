import type { LucideIcon } from "lucide-react";

interface SessionEmptyStateProps {
  readonly description: string;
  readonly icon: LucideIcon;
  readonly title: string;
}

export function SessionEmptyState({
  description,
  icon: Icon,
  title
}: SessionEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center px-8 py-12">
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Icon className="size-5" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <h1 className="m-0 text-base font-semibold tracking-tight text-slate-950">
          {title}
        </h1>
        <p className="mt-2 mb-0 text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}
