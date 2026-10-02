import { ArrowLeft, Check, ChevronDown, ChevronRight, RotateCcw, Zap } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { zhCN } from "@/locales/zh-CN";

export type ModelPickerPane = "model" | "effort";

export interface ComposerModelGroup {
  readonly id: string;
  readonly label: string;
  readonly options: readonly { readonly label: string; readonly value: string; readonly modelId: string }[];
}

interface ComposerModelPickerProps {
  readonly disabled: boolean;
  readonly groups: readonly ComposerModelGroup[];
  readonly selectedModel: string;
  readonly reasoningOptions: readonly string[];
  readonly selectedReasoningEffort: string;
  readonly defaultReasoningEffort: string | null;
  readonly pane: ModelPickerPane | null;
  readonly onPaneChange: (pane: ModelPickerPane | null) => void;
  readonly onModelChange: (value: string) => void;
  readonly onReasoningEffortChange: (value: string) => void;
  readonly onClose: () => void;
}

export function ComposerModelPicker({
  disabled, groups, selectedModel, reasoningOptions, selectedReasoningEffort,
  defaultReasoningEffort,
  pane, onPaneChange, onModelChange, onReasoningEffortChange, onClose,
}: ComposerModelPickerProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const modelListRef = useRef<HTMLDivElement>(null);
  const content = zhCN.conversation;
  const model = groups.flatMap((group) => group.options).find((option) => option.value === selectedModel);
  const modelLabel = model === undefined ? content.selectModel : model.label;
  const effectiveEffort = selectedReasoningEffort === "" ? defaultReasoningEffort : selectedReasoningEffort;
  const effortLabel = effectiveEffort === null ? content.reasoningNotSpecified : content.reasoningValue(effectiveEffort);
  const effortIndex = effectiveEffort === null ? -1 : reasoningOptions.indexOf(effectiveEffort);
  const progress = effortIndex < 0 || reasoningOptions.length < 2 ? 0 : effortIndex / (reasoningOptions.length - 1) * 100;
  const filteredGroups = groups.map((group) => ({
    ...group,
    options: group.options.filter((option) => `${group.label} ${option.label} ${option.modelId}`.toLowerCase().includes(query.toLowerCase())),
  })).filter((group) => group.options.length > 0);

  function focusPane() {
    if (pane === "model") searchRef.current?.focus();
    else if (reasoningOptions.length > 1 && effortIndex >= 0) sliderRef.current?.focus();
    else modelButtonRef.current?.focus();
  }

  useEffect(() => {
    if (pane === null) setQuery("");
    else focusPane();
  }, [pane]);

  return (
    <Popover
      open={pane !== null}
      onOpenChange={(open) => {
        onPaneChange(open ? "effort" : null);
        setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="composer-chip" disabled={disabled} aria-label={content.modelSelectorLabel} title={modelLabel}>
          <Zap size={13} aria-hidden="true" />
          <span className="truncate">{modelLabel}</span>
          {reasoningOptions.length > 0 && <span className="shrink-0 text-[11px] text-muted-foreground">· {effortLabel}</span>}
          <ChevronDown size={12} className="shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="max-h-[var(--radix-popover-content-available-height)] w-80 overflow-y-auto rounded-[20px] p-3"
        aria-label={content.modelSelectorLabel}
        onOpenAutoFocus={(event) => { event.preventDefault(); focusPane(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); onClose(); }}
        onEscapeKeyDown={(event) => {
          if (pane === "model") { event.preventDefault(); onPaneChange("effort"); }
        }}
      >
        {pane === "model" ? (
          <>
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => onPaneChange("effort")}>
              <ArrowLeft aria-hidden="true" />{content.selectModel}
            </Button>
            <Input
              ref={searchRef}
              aria-label={content.modelSearch}
              placeholder={content.modelSearch}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  modelListRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
                }
              }}
              className="my-2 h-8 text-xs"
            />
            <div
              ref={modelListRef}
              className="max-h-64 overflow-y-auto"
              onKeyDown={(event) => {
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
                const index = buttons.indexOf(event.target as HTMLButtonElement);
                if (buttons.length === 0) return;
                const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
                  (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
                buttons[next]?.focus();
              }}
            >
              {filteredGroups.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{content.noModelMatches}</p>}
              {filteredGroups.map((group) => (
                <div key={group.id}>
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground">{group.label}</div>
                  {group.options.map((option) => (
                    <Button
                      key={option.value} type="button" variant="ghost" size="sm"
                      className="h-auto min-h-8 w-full justify-start gap-2 whitespace-normal py-2 text-left"
                      disabled={disabled} aria-pressed={selectedModel === option.value}
                      onClick={() => { onModelChange(option.value); onPaneChange(null); }}
                    >
                      <span className="min-w-0 flex-1 break-words">
                        <span className="block">{option.label}</span>
                        {option.modelId !== option.label && <span className="block text-[11px] font-normal text-muted-foreground">{option.modelId}</span>}
                      </span>
                      {selectedModel === option.value && <Check aria-hidden="true" />}
                    </Button>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-1">
              <Zap className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">{reasoningOptions.length === 0 ? content.selectModel : effortLabel}</span>
              <Button type="button" size="icon" variant="ghost" className="size-7" disabled={disabled || selectedReasoningEffort === ""} aria-label={content.resetReasoning} onClick={() => onReasoningEffortChange("")}>
                <RotateCcw className="size-4" />
              </Button>
            </div>
            <Button ref={modelButtonRef} type="button" variant="ghost" size="sm" className="mt-1 w-full justify-center text-muted-foreground" disabled={disabled} onClick={() => onPaneChange("model")}>
              <span className="truncate">{modelLabel}</span><ChevronRight aria-hidden="true" />
            </Button>
            {reasoningOptions.length > 1 ? (
              <div className="mt-3 px-1">
                {effortIndex >= 0 && <input
                  ref={sliderRef}
                  type="range"
                  className="composer-effort-slider w-full"
                  style={{ "--effort-progress": `${progress}%` } as CSSProperties}
                  min={0}
                  max={reasoningOptions.length - 1}
                  step={1}
                  value={effortIndex}
                  disabled={disabled}
                  aria-label={content.reasoningSelectorLabel}
                  aria-valuetext={effortLabel}
                  onChange={(event) => {
                    const effort = reasoningOptions[Number(event.target.value)];
                    if (effort !== undefined) onReasoningEffortChange(effort);
                  }}
                />}
                <div className="mt-2 flex justify-between gap-1">
                  {reasoningOptions.map((effort, index) => (
                    <button key={effort} type="button" disabled={disabled} aria-label={content.reasoningValue(effort)} aria-pressed={effort === effectiveEffort} className="min-w-0 text-[10px] text-muted-foreground hover:text-foreground aria-pressed:font-medium aria-pressed:text-foreground" onClick={() => onReasoningEffortChange(effort)} title={content.reasoningValue(effort)}>
                      <span className="mx-auto mb-1 block size-1 rounded-full bg-current" />
                      {reasoningOptions.length > 5 && index !== 0 && index !== reasoningOptions.length - 1 ? "" : content.reasoningValue(effort)}
                    </button>
                  ))}
                </div>
              </div>
            ) : reasoningOptions.length === 1 ? (
              <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" disabled={disabled} onClick={() => {
                const effort = reasoningOptions[0];
                if (effort !== undefined) onReasoningEffortChange(effort);
              }}>{content.reasoningValue(reasoningOptions[0]!)}</Button>
            ) : <p className="px-2 pt-3 text-xs text-muted-foreground">{content.noReasoningOptions}</p>}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
