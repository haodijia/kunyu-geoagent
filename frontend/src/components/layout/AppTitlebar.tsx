import type { ReactNode } from "react";

interface AppTitlebarProps {
  readonly children?: ReactNode;
}

export function AppTitlebar({ children }: AppTitlebarProps) {
  return (
    <header className="relative z-50 flex h-[45px] shrink-0 items-center border-b border-slate-200 bg-white [-webkit-app-region:drag]">
      <div className="ml-[76px] flex items-center [-webkit-app-region:no-drag]">
        {children}
      </div>
    </header>
  );
}
