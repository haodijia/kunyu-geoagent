import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Zap,
} from "lucide-vue-next";
import { computed, defineComponent, shallowRef, type CSSProperties } from "vue";
export type ModelPickerPane = "model" | "effort";
export interface ComposerModelGroup {
  readonly id: string;
  readonly label: string;
  readonly options: readonly {
    readonly label: string;
    readonly value: string;
    readonly modelId: string;
  }[];
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
export const ComposerModelPicker = defineComponent(
  (componentProps: ComposerModelPickerProps, { slots: _slots }) => {
    const disabled = computed(() => componentProps.disabled),
      groups = computed(() => componentProps.groups),
      selectedModel = computed(() => componentProps.selectedModel),
      reasoningOptions = computed(() => componentProps.reasoningOptions),
      selectedReasoningEffort = computed(
        () => componentProps.selectedReasoningEffort,
      ),
      defaultReasoningEffort = computed(
        () => componentProps.defaultReasoningEffort,
      ),
      pane = computed(() => componentProps.pane),
      onPaneChange = computed(() => componentProps.onPaneChange),
      onModelChange = computed(() => componentProps.onModelChange),
      onReasoningEffortChange = computed(
        () => componentProps.onReasoningEffortChange,
      ),
      onClose = computed(() => componentProps.onClose);
    const query = shallowRef(""),
      setQuery = refSetter(query);
    const searchRef = shallowRef<HTMLInputElement | null>(null);
    const sliderRef = shallowRef<HTMLInputElement | null>(null);
    const modelButtonRef = shallowRef<HTMLButtonElement | null>(null);
    const modelListRef = shallowRef<HTMLDivElement | null>(null);
    const content = zhCN.conversation;
    const model = computed(() =>
      groups.value
        .flatMap((group) => group.options)
        .find((option) => option.value === selectedModel.value),
    );
    const modelLabel = computed(() =>
      model.value === undefined ? content.selectModel : model.value.label,
    );
    const effectiveEffort = computed(() =>
      selectedReasoningEffort.value === ""
        ? defaultReasoningEffort.value
        : selectedReasoningEffort.value,
    );
    const effortLabel = computed(() =>
      effectiveEffort.value === null
        ? content.reasoningNotSpecified
        : content.reasoningValue(effectiveEffort.value),
    );
    const effortIndex = computed(() =>
      effectiveEffort.value === null
        ? -1
        : reasoningOptions.value.indexOf(effectiveEffort.value),
    );
    const progress = computed(() =>
      effortIndex.value < 0 || reasoningOptions.value.length < 2
        ? 0
        : (effortIndex.value / (reasoningOptions.value.length - 1)) * 100,
    );
    const filteredGroups = computed(() =>
      groups.value
        .map((group) => ({
          ...group,
          options: group.options.filter((option) =>
            `${group.label} ${option.label} ${option.modelId}`
              .toLowerCase()
              .includes(query.value.toLowerCase()),
          ),
        }))
        .filter((group) => group.options.length > 0),
    );
    function focusPane() {
      if (pane.value === "model") searchRef.value?.focus();
      else if (reasoningOptions.value.length > 1 && effortIndex.value >= 0)
        sliderRef.value?.focus();
      else modelButtonRef.value?.focus();
    }
    watchMounted([() => pane.value], () => {
      if (pane.value === null) setQuery("");
      else focusPane();
    });
    return () => {
      const _pane = pane.value,
        _onPaneChange = onPaneChange.value,
        _disabled = disabled.value,
        _modelLabel = modelLabel.value,
        _reasoningOptions = reasoningOptions.value,
        _effortLabel = effortLabel.value,
        _onClose = onClose.value,
        _filteredGroups = filteredGroups.value,
        _selectedModel = selectedModel.value,
        _onModelChange = onModelChange.value,
        _selectedReasoningEffort = selectedReasoningEffort.value,
        _onReasoningEffortChange = onReasoningEffortChange.value,
        _effortIndex = effortIndex.value,
        _progress = progress.value,
        _effectiveEffort = effectiveEffort.value;
      return (
        <Popover
          open={_pane !== null}
          onUpdate:open={(open) => {
            _onPaneChange(open ? "effort" : null);
            setQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              class="composer-chip"
              disabled={_disabled}
              aria-label={content.modelSelectorLabel}
              title={_modelLabel}
            >
              <Zap size={13} aria-hidden="true" />
              <span class="truncate">{_modelLabel}</span>
              {_reasoningOptions.length > 0 && (
                <span class="shrink-0 text-[11px] text-muted-foreground">
                  · {_effortLabel}
                </span>
              )}
              <ChevronDown size={12} class="shrink-0" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            class="max-h-[var(--reka-popover-content-available-height)] w-80 overflow-y-auto rounded-[20px] p-3"
            aria-label={content.modelSelectorLabel}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              focusPane();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              _onClose();
            }}
            onEscapeKeyDown={(event) => {
              if (_pane === "model") {
                event.preventDefault();
                _onPaneChange("effort");
              }
            }}
          >
            {_pane === "model" ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="w-full justify-start"
                  onClick={() => _onPaneChange("effort")}
                >
                  <ArrowLeft aria-hidden="true" />
                  {content.selectModel}
                </Button>
                <Input
                  ref={searchRef}
                  aria-label={content.modelSearch}
                  placeholder={content.modelSearch}
                  value={query.value}
                  onInput={(event) =>
                    setQuery((event.target as HTMLInputElement).value)
                  }
                  onKeydown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      modelListRef.value
                        ?.querySelector<HTMLButtonElement>(
                          "button:not(:disabled)",
                        )
                        ?.focus();
                    }
                  }}
                  class="my-2 h-8 text-xs"
                />
                <div
                  ref={modelListRef}
                  class="max-h-64 overflow-y-auto"
                  onKeydown={(event) => {
                    if (
                      !["ArrowDown", "ArrowUp", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const buttons = [
                      ...(
                        event.currentTarget as HTMLElement
                      ).querySelectorAll<HTMLButtonElement>(
                        "button:not(:disabled)",
                      ),
                    ];
                    const index = buttons.indexOf(
                      event.target as HTMLButtonElement,
                    );
                    if (buttons.length === 0) return;
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? buttons.length - 1
                          : (index +
                              (event.key === "ArrowDown" ? 1 : -1) +
                              buttons.length) %
                            buttons.length;
                    buttons[next]?.focus();
                  }}
                >
                  {_filteredGroups.length === 0 && (
                    <p class="px-2 py-3 text-xs text-muted-foreground">
                      {content.noModelMatches}
                    </p>
                  )}
                  {_filteredGroups.map((group) => (
                    <div key={group.id}>
                      <div class="px-2 py-1.5 text-[11px] text-muted-foreground">
                        {group.label}
                      </div>
                      {group.options.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant="ghost"
                          size="sm"
                          class="h-auto min-h-8 w-full justify-start gap-2 whitespace-normal py-2 text-left"
                          disabled={_disabled}
                          aria-pressed={_selectedModel === option.value}
                          onClick={() => {
                            _onModelChange(option.value);
                            _onPaneChange(null);
                          }}
                        >
                          <span class="min-w-0 flex-1 break-words">
                            <span class="block">{option.label}</span>
                            {option.modelId !== option.label && (
                              <span class="block text-[11px] font-normal text-muted-foreground">
                                {option.modelId}
                              </span>
                            )}
                          </span>
                          {_selectedModel === option.value && (
                            <Check aria-hidden="true" />
                          )}
                        </Button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div class="flex items-center justify-between gap-2 px-1">
                  <Zap
                    class="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span class="text-sm font-medium">
                    {_reasoningOptions.length === 0
                      ? content.selectModel
                      : _effortLabel}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    class="size-7"
                    disabled={_disabled || _selectedReasoningEffort === ""}
                    aria-label={content.resetReasoning}
                    onClick={() => _onReasoningEffortChange("")}
                  >
                    <RotateCcw class="size-4" />
                  </Button>
                </div>
                <Button
                  ref={modelButtonRef}
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="mt-1 w-full justify-center text-muted-foreground"
                  disabled={_disabled}
                  onClick={() => _onPaneChange("model")}
                >
                  <span class="truncate">{_modelLabel}</span>
                  <ChevronRight aria-hidden="true" />
                </Button>
                {_reasoningOptions.length > 1 ? (
                  <div class="mt-3 px-1">
                    {_effortIndex >= 0 && (
                      <input
                        ref={sliderRef}
                        type="range"
                        class="composer-effort-slider w-full"
                        style={
                          {
                            "--effort-progress": `${_progress}%`,
                          } as CSSProperties
                        }
                        min={0}
                        max={_reasoningOptions.length - 1}
                        step={1}
                        value={_effortIndex}
                        disabled={_disabled}
                        aria-label={content.reasoningSelectorLabel}
                        aria-valuetext={_effortLabel}
                        onInput={(event) => {
                          const effort =
                            _reasoningOptions[
                              Number((event.target as HTMLInputElement).value)
                            ];
                          if (effort !== undefined)
                            _onReasoningEffortChange(effort);
                        }}
                      />
                    )}
                    <div class="mt-2 flex justify-between gap-1">
                      {_reasoningOptions.map((effort, index) => (
                        <button
                          key={effort}
                          type="button"
                          disabled={_disabled}
                          aria-label={content.reasoningValue(effort)}
                          aria-pressed={effort === _effectiveEffort}
                          class="min-w-0 text-[10px] text-muted-foreground hover:text-foreground aria-pressed:font-medium aria-pressed:text-foreground"
                          onClick={() => _onReasoningEffortChange(effort)}
                          title={content.reasoningValue(effort)}
                        >
                          <span class="mx-auto mb-1 block size-1 rounded-full bg-current" />
                          {_reasoningOptions.length > 5 &&
                          index !== 0 &&
                          index !== _reasoningOptions.length - 1
                            ? ""
                            : content.reasoningValue(effort)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : _reasoningOptions.length === 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="mt-2 w-full"
                    disabled={_disabled}
                    onClick={() => {
                      const effort = _reasoningOptions[0];
                      if (effort !== undefined)
                        _onReasoningEffortChange(effort);
                    }}
                  >
                    {content.reasoningValue(_reasoningOptions[0]!)}
                  </Button>
                ) : (
                  <p class="px-2 pt-3 text-xs text-muted-foreground">
                    {content.noReasoningOptions}
                  </p>
                )}
              </>
            )}
          </PopoverContent>
        </Popover>
      );
    };
  },
  {
    name: "ComposerModelPicker",
    inheritAttrs: false,
    props: [
      "disabled",
      "groups",
      "selectedModel",
      "reasoningOptions",
      "selectedReasoningEffort",
      "defaultReasoningEffort",
      "pane",
      "onPaneChange",
      "onModelChange",
      "onReasoningEffortChange",
      "onClose",
    ],
  },
);
