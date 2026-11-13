import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { Check, Copy } from "lucide-vue-next";
import { computed, defineComponent, shallowRef } from "vue";
import { toast } from "vue-sonner";
export const CopyButton = defineComponent(
  (
    componentProps: {
      readonly text: string;
    },
    { slots: _slots },
  ) => {
    const text = computed(() => componentProps.text);
    const copied = shallowRef(false),
      setCopied = refSetter(copied);
    const timerRef = shallowRef<ReturnType<typeof setTimeout> | null>(null);
    watchMounted([], () => () => {
      if (timerRef.value !== null) clearTimeout(timerRef.value);
    });
    const label = computed(() =>
      copied.value ? zhCN.conversation.copied : zhCN.conversation.copy,
    );
    return () => {
      const _label = label.value,
        _text = text.value;
      return (
        <Tooltip label={_label} side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-6 rounded text-muted-foreground"
            aria-label={_label}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(_text);
                setCopied(true);
                if (timerRef.value !== null) clearTimeout(timerRef.value);
                timerRef.value = setTimeout(() => setCopied(false), 2_000);
              } catch (error) {
                console.error("[conversation] Failed to copy message.", error);
                toast.error(zhCN.conversation.copyFailed);
              }
            }}
          >
            {copied.value ? <Check class="size-4" /> : <Copy class="size-4" />}
          </Button>
        </Tooltip>
      );
    };
  },
  {
    name: "CopyButton",
    inheritAttrs: false,
    props: ["text"],
  },
);
