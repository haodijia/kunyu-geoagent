/**
 * Adapted from mu's SettingsPageHeader.tsx and SettingsPageWrapper.tsx.
 * Copyright 2025 AionUi (aionui.com). SPDX-License-Identifier: Apache-2.0
 */
import type { ReactNode } from "react";

export function SettingsPageWrapper({
  children
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="settings-page-wrapper box-border min-h-full w-full overflow-y-auto bg-[var(--bg-1)] px-[16px] md:px-[32px]">
      <div className="settings-page-content mx-auto w-full pt-[16px] pb-[16px] md:max-w-[880px] md:pt-[24px] md:pb-[24px]">
        {children}
      </div>
    </div>
  );
}

export function SettingsPageHeader({
  title,
  description,
  actions
}: {
  readonly title: string;
  readonly description: string;
  readonly actions: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 -mt-[16px] bg-[var(--bg-1)] pt-[16px] md:-mt-[24px] md:pt-[24px]">
      <div className="flex min-h-[34px] items-center justify-between gap-[8px] sm:gap-[16px]">
        <h1 className="m-0 min-w-0 flex-1 text-[18px] leading-[1.3] font-semibold text-t-primary md:text-[20px]">
          {title}
        </h1>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-[8px]">
            {actions}
          </div>
        ) : null}
      </div>
      <p
        className="m-0 mt-[8px] text-[13px] leading-relaxed text-t-secondary"
        style={{ textWrap: "balance" }}
      >
        {description}
      </p>
    </div>
  );
}
