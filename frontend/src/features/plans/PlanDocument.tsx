import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";
import { PlanPreview } from "./PlanPreview";

interface PlanReaderState {
  readonly document: { readonly toolId: string; readonly title: string } | null;
  readonly reviewed: readonly string[];
}
interface PlanReaderActions {
  readonly openPlan: (toolId: string, title: string) => void;
  readonly openReview: (questionId: string, toolId: string, title: string) => void;
}
const PlanReaderContext = createContext<PlanReaderActions | null>(null);
const emptyState: PlanReaderState = { document: null, reviewed: [] };

function readState(key: string): PlanReaderState {
  const stored = sessionStorage.getItem(key);
  if (stored === null) return emptyState;
  const state: unknown = JSON.parse(stored);
  if (typeof state !== "object" || state === null || !("document" in state) || !("reviewed" in state)
    || !Array.isArray(state.reviewed) || !state.reviewed.every(id => typeof id === "string" && id.length > 0)
    || (state.document !== null && (typeof state.document !== "object" || !("toolId" in state.document)
      || typeof state.document.toolId !== "string" || !state.document.toolId || !("title" in state.document)
      || typeof state.document.title !== "string" || !state.document.title))) {
    throw new Error("Invalid plan reader state.");
  }
  return state as PlanReaderState;
}

export function PlanDocumentProvider({ sessionId, children }: { readonly sessionId: string; readonly children: ReactNode }) {
  const key = `kunyu.session.${sessionId}.plan-reader`;
  const [initial] = useState(() => {
    try { return { state: readState(key), error: null }; }
    catch (error) { console.error("[plans] Reader state could not be restored.", error); return { state: emptyState, error: zhCN.planReview.stateReadFailed }; }
  });
  const [state, setState] = useState(initial.state);
  const [storageError, setStorageError] = useState<string | null>(initial.error);
  const readFailed = useRef(initial.error !== null);
  const reviewed = useRef(new Set(state.reviewed));
  useEffect(() => {
    if (readFailed.current) return;
    try { sessionStorage.setItem(key, JSON.stringify(state)); setStorageError(null); }
    catch (error) { console.error("[plans] Reader state could not be saved.", error); setStorageError(zhCN.planReview.stateWriteFailed); }
  }, [key, state]);
  const openPlan = useCallback((toolId: string, title: string) => {
    if (!readFailed.current) setState(current => ({ ...current, document: { toolId, title } }));
  }, []);
  const openReview = useCallback((questionId: string, toolId: string, title: string) => {
    if (readFailed.current || reviewed.current.has(questionId)) return;
    reviewed.current.add(questionId);
    setState({ document: { toolId, title }, reviewed: [...reviewed.current] });
  }, []);
  function reset() {
    try {
      sessionStorage.removeItem(key); readFailed.current = false; reviewed.current.clear();
      setState(emptyState); setStorageError(null);
    } catch (error) { console.error("[plans] Reader state could not be cleared.", error); setStorageError(zhCN.planReview.stateReadFailed); }
  }
  return <PlanReaderContext value={{ openPlan, openReview }}>
    {storageError !== null && <div role="alert" className="flex items-center gap-2 px-4 py-2 text-xs text-destructive">
      {storageError}{readFailed.current && <Button variant="ghost" size="sm" onClick={reset}>{zhCN.planReview.resetState}</Button>}
    </div>}
    {children}
    <AlertDialog open={state.document !== null} onOpenChange={open => { if (!open) setState(current => ({ ...current, document: null })); }}>
      <AlertDialogContent role="dialog" className="flex h-[85dvh] min-h-0 max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1"><AlertDialogTitle className="truncate">{state.document?.title}</AlertDialogTitle>
            <AlertDialogDescription className="mt-1">{zhCN.planReview.document}</AlertDialogDescription></div>
          <AlertDialogCancel asChild><Button variant="ghost" size="icon" aria-label={zhCN.planReview.close}><X className="size-4" /></Button></AlertDialogCancel>
        </div>
        {state.document !== null && <PlanPreview toolId={state.document.toolId} />}
      </AlertDialogContent>
    </AlertDialog>
  </PlanReaderContext>;
}

export function usePlanDocument(): PlanReaderActions {
  const reader = useContext(PlanReaderContext);
  if (reader === null) throw new Error("Plan document provider is required.");
  return reader;
}
