import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ModelConnection } from "@/features/settings/models/api";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { ChevronDown, Search } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, type VNodeChild } from "vue";
const content = zhCN.modelConnections;
export const ModelDetailSection = defineComponent(
  (
    componentProps: {
      readonly title: string;
      readonly description: string;
      readonly children?: VNodeChild;
    },
    { slots },
  ) => {
    const title = computed(() => componentProps.title),
      description = computed(() => componentProps.description),
      children = () => slots.default?.();
    return () => {
      const _title = title.value,
        _description = description.value;
      return (
        <section class="model-detail-section">
          <div class="model-detail-section__heading">
            <h3>{_title}</h3>
            <p>{_description}</p>
          </div>
          <div class="model-detail-section__content">{children()}</div>
        </section>
      );
    };
  },
  {
    name: "ModelDetailSection",
    inheritAttrs: false,
    props: ["title", "description"],
  },
);
export const ModelExpandableRow = defineComponent(
  (
    componentProps: {
      readonly label: string;
      readonly value: string;
      readonly actionLabel: string;
      readonly editing: boolean;
      readonly busy: boolean;
      readonly canSave: boolean;
      readonly onEdit: () => void;
      readonly onCancel: () => void;
      readonly onSave: () => void;
      readonly children?: VNodeChild;
    },
    { slots },
  ) => {
    const label = computed(() => componentProps.label),
      value = computed(() => componentProps.value),
      actionLabel = computed(() => componentProps.actionLabel),
      editing = computed(() => componentProps.editing),
      busy = computed(() => componentProps.busy),
      canSave = computed(() => componentProps.canSave),
      onEdit = computed(() => componentProps.onEdit),
      onCancel = computed(() => componentProps.onCancel),
      onSave = computed(() => componentProps.onSave),
      children = () => slots.default?.();
    return () => {
      const _label = label.value,
        _value = value.value,
        _editing = editing.value,
        _busy = busy.value,
        _onEdit = onEdit.value,
        _actionLabel = actionLabel.value,
        _onCancel = onCancel.value,
        _canSave = canSave.value,
        _onSave = onSave.value;
      return (
        <div class="model-expandable-row">
          <div class="model-expandable-row__summary">
            <span>
              <strong>{_label}</strong>
              <small>{_value}</small>
            </span>
            {!_editing ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={_busy}
                onClick={_onEdit}
              >
                {_actionLabel}
              </Button>
            ) : null}
          </div>
          {_editing ? (
            <div class="model-expandable-row__editor">
              {children()}
              <div class="model-expandable-row__actions">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={_busy}
                  onClick={_onCancel}
                >
                  {content.cancel}
                </Button>
                <Button
                  size="sm"
                  disabled={_busy || !_canSave}
                  onClick={_onSave}
                >
                  {content.detail.save}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      );
    };
  },
  {
    name: "ModelExpandableRow",
    inheritAttrs: false,
    props: [
      "label",
      "value",
      "actionLabel",
      "editing",
      "busy",
      "canSave",
      "onEdit",
      "onCancel",
      "onSave",
    ],
  },
);
export const EnabledModelSelector = defineComponent(
  (
    componentProps: {
      readonly entries: ModelConnection["entries"];
      readonly enabledIds: string[];
      readonly disabled: boolean;
      readonly onChange: (ids: string[]) => void;
    },
    { slots: _slots },
  ) => {
    const entries = computed(() => componentProps.entries),
      enabledIds = computed(() => componentProps.enabledIds),
      disabled = computed(() => componentProps.disabled),
      onChange = computed(() => componentProps.onChange);
    const open = shallowRef(false),
      setOpen = refSetter(open);
    const query = shallowRef(""),
      setQuery = refSetter(query);
    const filtered = computed(() => {
      const normalized = query.value.trim().toLocaleLowerCase();
      return entries.value.filter((entry) =>
        [entry.model_id, entry.display_name ?? ""].some((value) =>
          value.toLocaleLowerCase().includes(normalized),
        ),
      );
    });
    const label = computed(() =>
      enabledIds.value.length === 0
        ? content.detail.noModels
        : enabledIds.value.join(", "),
    );
    return () => {
      const _disabled = disabled.value,
        _entries = entries.value,
        _label2 = label.value,
        _filtered = filtered.value,
        _enabledIds = enabledIds.value,
        _onChange = onChange.value;
      return (
        <div class="model-selector">
          <button
            type="button"
            disabled={_disabled || _entries.length === 0}
            onClick={() => setOpen((current) => !current)}
          >
            <span>{_label2}</span>
            <ChevronDown class="size-4" />
          </button>
          {open.value ? (
            <div class="model-selector__popover">
              <label>
                <Search class="size-4" />
                <Input
                  value={query.value}
                  placeholder={content.detail.searchModels}
                  onInput={(event) =>
                    setQuery((event.target as HTMLInputElement).value)
                  }
                />
              </label>
              <div class="model-selector__list">
                {_filtered.map((entry) => {
                  const available = entry.availability === "available";
                  return (
                    <label key={entry.model_id}>
                      <Checkbox
                        checked={_enabledIds.includes(entry.model_id)}
                        disabled={_disabled || !available}
                        onUpdate:modelValue={(checked) =>
                          _onChange(
                            checked === true
                              ? [..._enabledIds, entry.model_id]
                              : _enabledIds.filter(
                                  (id) => id !== entry.model_id,
                                ),
                          )
                        }
                      />
                      <span>
                        {entry.display_name || entry.model_id}
                        <small>{entry.model_id}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      );
    };
  },
  {
    name: "EnabledModelSelector",
    inheritAttrs: false,
    props: ["entries", "enabledIds", "disabled", "onChange"],
  },
);
