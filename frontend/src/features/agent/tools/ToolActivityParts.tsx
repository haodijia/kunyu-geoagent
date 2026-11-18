import { refSetter } from "@/lib/lifecycle";
import { computed, defineComponent, shallowRef, type VNodeChild } from "vue";
// Copyright 2025 AionUi (aionui.com)
// SPDX-License-Identifier: Apache-2.0
// Adapted from Mu/AionUi ToolKindIcon and tool rows (Apache-2.0).
import {
  toolKind,
  type ToolDisplayStatus,
  type ToolTargetValue,
} from "@/features/agent/tools/tool-presentation";
import styles from "@/features/agent/tools/ToolActivity.module.css";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import { zhCN } from "@/locales/zh-CN";
import {
  Api,
  Earth,
  Editor,
  FileText,
  FolderOpen,
  Local,
  PeopleSpeak,
  Search,
  Terminal,
} from "@icon-park/vue-next";
import { ChevronRight, LoaderCircle } from "lucide-vue-next";
const content = zhCN.conversation.tools;
const icons = {
  read: FileText,
  edit: Editor,
  shell: Terminal,
  search: Search,
  web: Earth,
  map: Local,
  agent: PeopleSpeak,
  other: Api,
};
export const ToolKindIcon = defineComponent(
  (
    componentProps: {
      readonly name: string;
    },
    { slots: _slots },
  ) => {
    const name = computed(() => componentProps.name);
    const icon = computed(() =>
      name.value === "glob" ? FolderOpen : icons[toolKind(name.value)],
    );
    return () => {
      const Icon = icon.value;
      return (
        <span class={styles.kindIcon} aria-hidden="true">
          <Icon size={14} theme="outline" />
        </span>
      );
    };
  },
  {
    name: "ToolKindIcon",
    inheritAttrs: false,
    props: ["name"],
  },
);
export const ToolStatusBadge = defineComponent(
  (
    componentProps: {
      readonly status: ToolDisplayStatus;
      readonly label: string;
    },
    { slots: _slots },
  ) => {
    const status = computed(() => componentProps.status),
      label = computed(() => componentProps.label);
    return () => {
      const _status = status.value,
        _label = label.value;
      if (_status === "running")
        return (
          <LoaderCircle
            class="size-3 shrink-0 animate-spin text-primary motion-reduce:animate-none"
            role="img"
            aria-label={_label}
          />
        );
      return (
        <span
          class={styles.statusDot}
          data-tool-status={_status}
          role="img"
          aria-label={_label}
        />
      );
    };
  },
  {
    name: "ToolStatusBadge",
    inheritAttrs: false,
    props: ["status", "label"],
  },
);
export const ToolTarget = defineComponent(
  (
    componentProps: {
      readonly target: ToolTargetValue | undefined;
    },
    { slots: _slots },
  ) => {
    const target = computed(() => componentProps.target);
    const cut = computed(() =>
      target.value === undefined
        ? 0
        : Math.max(
            target.value.text.lastIndexOf("/"),
            target.value.text.lastIndexOf("\\"),
          ) + 1,
    );
    return () => {
      const _target = target.value,
        _cut = cut.value;
      if (_target === undefined) return null;
      if (!_target.path)
        return (
          <code class={styles.callPreview} title={_target.text}>
            {_target.text}
          </code>
        );
      return (
        <code
          class={`${styles.callPreview} ${styles.pathPreview}`}
          title={_target.text}
          data-tool-path={_target.text}
        >
          <span class={styles.pathHead}>{_target.text.slice(0, _cut)}</span>
          <span class={styles.pathTail}>{_target.text.slice(_cut)}</span>
        </code>
      );
    };
  },
  {
    name: "ToolTarget",
    inheritAttrs: false,
    props: ["target"],
  },
);
export const ToolDetail = defineComponent(
  (
    componentProps: {
      readonly text: string;
      readonly danger?: boolean;
      readonly label: string;
    },
    { slots: _slots },
  ) => {
    const children = computed(() => componentProps.text),
      danger = computed(() =>
        componentProps.danger === undefined ? false : componentProps.danger,
      ),
      label = computed(() => componentProps.label);
    const full = shallowRef(false),
      setFull = refSetter(full);
    const head = computed(() =>
      children.value.split("\n").slice(0, 14).join("\n").slice(0, 1_400),
    );
    const clipped = computed(() => head.value.length < children.value.length);
    return () => {
      const _label2 = label.value,
        _children = children.value,
        _danger = danger.value,
        _clipped = clipped.value,
        _head = head.value;
      return (
        <ToolResultPanel label={_label2} copyText={_children}>
          <pre
            class={`m-0 max-h-80 overflow-auto px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere] ${_danger ? "text-destructive" : "text-secondary-foreground"}`}
          >
            {full.value || !_clipped ? _children : `${_head}\n…`}
          </pre>
          {_clipped ? (
            <button
              type="button"
              class="mt-0.5 rounded px-1.5 py-0.5 text-xs text-secondary-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-expanded={full.value}
              onClick={() => setFull((value) => !value)}
            >
              {full.value ? content.showLess : content.showMore}
            </button>
          ) : null}
        </ToolResultPanel>
      );
    };
  },
  {
    name: "ToolDetail",
    inheritAttrs: false,
    props: ["text", "danger", "label"],
  },
);
export const ToolResultPanel = defineComponent(
  (
    componentProps: {
      readonly label: string;
      readonly copyText: string;
      readonly children?: VNodeChild;
    },
    { slots },
  ) => {
    const label = computed(() => componentProps.label),
      copyText = computed(() => componentProps.copyText),
      children = () => slots.default?.();
    return () => {
      const _label3 = label.value,
        _copyText = copyText.value;
      return (
        <div class={styles.resultCard}>
          <div class={styles.resultHeader}>
            <span class={styles.resultLabel} title={_label3}>
              {_label3}
            </span>
            <CopyButton text={_copyText} />
          </div>
          {children()}
        </div>
      );
    };
  },
  {
    name: "ToolResultPanel",
    inheritAttrs: false,
    props: ["label", "copyText"],
  },
);
export const ToolParameters = defineComponent(
  (
    componentProps: {
      readonly arguments: Readonly<Record<string, unknown>>;
    },
    { slots: _slots },
  ) => {
    const value = computed(() => componentProps.arguments);
    return () => {
      const _value = value.value;
      return (
        <details class={styles.parameters}>
          <summary>
            <ChevronRight size={12} aria-hidden="true" />
            {content.parameters}
          </summary>
          <ToolDetail
            label={content.input}
            text={JSON.stringify(_value, null, 2)}
          />
        </details>
      );
    };
  },
  {
    name: "ToolParameters",
    inheritAttrs: false,
    props: ["arguments"],
  },
);
