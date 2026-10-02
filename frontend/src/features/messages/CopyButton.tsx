import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { zhCN } from "@/locales/zh-CN";

export function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current !== null) clearTimeout(timerRef.current); }, []);
  const label = copied ? zhCN.conversation.copied : zhCN.conversation.copy;
  return (
    <Tooltip label={label} side="top">
        <Button type="button" variant="ghost" size="icon" className="size-6 rounded text-muted-foreground" aria-label={label} onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            if (timerRef.current !== null) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setCopied(false), 2_000);
          } catch (error) {
            console.error("[conversation] Failed to copy message.", error);
            toast.error(zhCN.conversation.copyFailed);
          }
        }}>
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </Button>
    </Tooltip>
  );
}
