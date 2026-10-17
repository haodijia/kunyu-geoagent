import { Button } from "@/components/ui/button";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import type { StorageResult } from "@/types/runtime";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, LoaderCircle } from "lucide-react";
import { useState } from "react";

const content = zhCN.storage;

async function unwrap<T>(operation: Promise<StorageResult<T>>): Promise<T> {
  const result = await operation;
  if (!result.ok) {
    const messages: Readonly<Record<string, string>> = content.errors;
    throw new Error(Object.hasOwn(messages, result.code) ? messages[result.code] : content.failed);
  }
  return result.value;
}

export function StorageSettingsPage() {
  const current = useQuery({ queryKey: ["desktop", "storage"], queryFn: () => unwrap(window.kunyu.storage.status()) });
  const [target, setTarget] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "choosing" | "migrating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  async function choose() {
    setPhase("choosing"); setError(null);
    try {
      const directory = await unwrap(window.kunyu.storage.choose());
      if (directory !== null) { setTarget(directory); setCompleted(false); }
    } catch (reason) { console.error("[storage] Directory selection failed.", reason); setError(reason instanceof Error ? reason.message : content.failed); }
    finally { setPhase("idle"); }
  }

  async function migrate() {
    setPhase("migrating"); setError(null);
    try {
      await unwrap(window.kunyu.storage.migrate());
      setTarget(null); setCompleted(true);
      await current.refetch();
    } catch (reason) { console.error("[storage] Migration failed.", reason); setError(reason instanceof Error ? reason.message : content.failed); }
    finally { setPhase("idle"); }
  }

  return <SettingsPageWrapper>
    <SettingsPageHeader title={content.title} description={content.description} actions={null} />
    {current.isPending ? <p className="mt-8 text-sm text-muted-foreground" role="status">{content.loading}</p>
      : current.isError ? <div role="alert" className="mt-8 space-y-3"><p className="text-sm text-destructive">{current.error.message}</p><Button variant="outline" onClick={() => void current.refetch()}>{content.retry}</Button></div>
      : <div className="mt-8 space-y-8">
        <section className="settings-group space-y-3">
          <h2 className="settings-group__title">{content.businessDirectory}</h2>
          <p className="break-all rounded-md border border-border px-3 py-2 text-sm select-text">{current.data.dataDirectory}</p>
          <p className="settings-group__help">{content.businessHelp}</p>
          <Button className="w-fit" variant="outline" disabled={phase !== "idle"} onClick={() => void choose()}><FolderOpen className="size-4" />{content.choose}</Button>
        </section>
        {target !== null ? <section className="settings-group space-y-3">
          <h2 className="settings-group__title">{content.targetDirectory}</h2>
          <p className="break-all text-sm select-text">{target}</p>
          <p className="settings-group__help">{content.migrationHelp}</p>
          <Button className="w-fit" disabled={phase !== "idle"} onClick={() => void migrate()}>{phase === "migrating" ? <LoaderCircle className="size-4 animate-spin" /> : null}{phase === "migrating" ? content.migrating : content.migrate}</Button>
        </section> : null}
        {error !== null ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {completed ? <p role="status" className="text-sm">{content.completed}</p> : null}
        <section className="settings-group space-y-3 border-t border-border pt-6">
          <h2 className="settings-group__title">{content.runtimeDirectory}</h2>
          <p className="break-all text-sm text-muted-foreground select-text">{current.data.runtimeDirectory}</p>
          <p className="settings-group__help">{content.runtimeHelp}</p>
        </section>
      </div>}
  </SettingsPageWrapper>;
}
