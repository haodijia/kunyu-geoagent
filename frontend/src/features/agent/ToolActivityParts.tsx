// Copyright 2025 AionUi (aionui.com)
// SPDX-License-Identifier: Apache-2.0
// Adapted from Mu/AionUi ToolKindIcon and tool rows (Apache-2.0).
import { Api, Earth, Editor, FileText, PeopleSpeak, Search, Terminal } from "@icon-park/react";
import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CopyButton } from "@/features/messages/CopyButton";
import { zhCN } from "@/locales/zh-CN";
import { toolKind, type ToolDisplayStatus, type ToolTargetValue } from "./tool-presentation";
import styles from "./ToolActivity.module.css";

const content = zhCN.conversation.tools;
const icons = { read: FileText, edit: Editor, shell: Terminal, search: Search, web: Earth, agent: PeopleSpeak, other: Api };

export function ToolKindIcon({ name }: { readonly name: string }) {
  const Icon = icons[toolKind(name)];
  return <span className={styles.kindIcon} aria-hidden="true"><Icon size={14} theme="outline" /></span>;
}

export function ToolStatusBadge({ status, label }: { readonly status: ToolDisplayStatus; readonly label: string }) {
  return <span className={styles.statusDot} data-tool-status={status} role="img" aria-label={label} />;
}

export function ToolTarget({ target }: { readonly target: ToolTargetValue | undefined }) {
  if (target === undefined) return null;
  if (!target.path) return <code className={styles.callPreview} title={target.text}>{target.text}</code>;
  const cut = Math.max(target.text.lastIndexOf("/"), target.text.lastIndexOf("\\")) + 1;
  return <code className={`${styles.callPreview} ${styles.pathPreview}`} title={target.text} data-tool-path={target.text}>
    <span className={styles.pathHead}>{target.text.slice(0, cut)}</span>
    <span className={styles.pathTail}>{target.text.slice(cut)}</span>
  </code>;
}

export function ToolDetail({
  children,
  danger = false,
  label,
}: {
  readonly children: string;
  readonly danger?: boolean;
  readonly label: string;
}) {
  const [full, setFull] = useState(false);
  const head = children.split("\n").slice(0, 14).join("\n").slice(0, 1_400);
  const clipped = head.length < children.length;
  return (
    <ToolResultPanel label={label} copyText={children}>
      <pre
        className={`m-0 max-h-80 overflow-auto px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere] ${danger ? "text-destructive" : "text-secondary-foreground"}`}
      >
        {full || !clipped ? children : `${head}\n…`}
      </pre>
      {clipped ? (
        <button
          type="button"
          className="mt-0.5 rounded px-1.5 py-0.5 text-xs text-secondary-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-expanded={full}
          onClick={() => setFull((value) => !value)}
        >
          {full ? content.showLess : content.showMore}
        </button>
      ) : null}
    </ToolResultPanel>
  );
}

export function ToolResultPanel({ label, copyText, children }: {
  readonly label: string;
  readonly copyText: string;
  readonly children: ReactNode;
}) {
  return <div className={styles.resultCard}>
    <div className={styles.resultHeader}>
      <span className={styles.resultLabel} title={label}>{label}</span>
      <CopyButton text={copyText} />
    </div>
    {children}
  </div>;
}

export function ToolParameters({ arguments: value }: { readonly arguments: Readonly<Record<string, unknown>> }) {
  return <details className={styles.parameters}>
    <summary><ChevronRight size={12} aria-hidden="true" />{content.parameters}</summary>
    <ToolDetail label={content.input}>{JSON.stringify(value, null, 2)}</ToolDetail>
  </details>;
}
