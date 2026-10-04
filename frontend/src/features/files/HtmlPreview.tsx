import { useEffect, useMemo, useRef } from "react";

import { zhCN } from "@/locales/zh-CN";
import type { PreviewScrollTarget } from "./usePreviewScrollSync";

interface Props {
  readonly text: string;
  readonly onScroll: (percent: number) => void;
  readonly onScrollTarget: (target: PreviewScrollTarget | null) => void;
}

function scrollBridge(channel: string): string {
  return `<script>(() => {
    const channel = ${JSON.stringify(channel)};
    let animation = null;
    const percent = () => {
      const root = document.scrollingElement;
      const range = root.scrollHeight - window.innerHeight;
      return range > 0 ? Math.max(0, Math.min(1, root.scrollTop / range)) : 0;
    };
    const publish = type => parent.postMessage({ channel, type, percent: percent() }, '*');
    const notify = () => {
      if (animation !== null) return;
      animation = requestAnimationFrame(() => { animation = null; publish('scroll'); });
    };
    window.addEventListener('message', event => {
      const message = event.data;
      if (event.source !== parent || !message || message.channel !== channel || message.type !== 'scrollTo'
          || !Number.isFinite(message.percent) || message.percent < 0 || message.percent > 1) return;
      const root = document.scrollingElement;
      window.scrollTo({ top: message.percent * Math.max(0, root.scrollHeight - window.innerHeight), behavior: 'instant' });
    });
    window.addEventListener('scroll', notify, { passive: true });
    window.addEventListener('DOMContentLoaded', () => {
      publish('ready');
      new ResizeObserver(notify).observe(document.documentElement);
    }, { once: true });
  })();</script>`;
}

export function HtmlPreview({ text, onScroll, onScrollTarget }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onScroll, onScrollTarget }); callbacks.current = { onScroll, onScrollTarget };
  const channel = useMemo(() => crypto.randomUUID(), [text]);
  const document = useMemo(() => `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">${scrollBridge(channel)}${text}`, [channel, text]);
  useEffect(() => {
    let position = 0;
    let ready = false;
    const target: PreviewScrollTarget = {
      getPercent: () => position,
      scrollToPercent: percent => iframe.current!.contentWindow!.postMessage({ channel, type: "scrollTo", percent }, "*"),
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || typeof event.data !== "object" || event.data === null || event.data.channel !== channel) return;
      const message = event.data;
      if (!Number.isFinite(message.percent) || message.percent < 0 || message.percent > 1 || !(message.type === "ready" || message.type === "scroll")) {
        console.error("[files] Invalid HTML preview scroll message.");
        return;
      }
      position = message.percent;
      if (message.type === "ready" && !ready) { ready = true; callbacks.current.onScrollTarget(target); }
      else if (ready) callbacks.current.onScroll(position);
    };
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); callbacks.current.onScrollTarget(null); };
  }, [channel]);
  return <iframe ref={iframe} title={zhCN.filePreview.html} className="min-h-0 w-full flex-1 border-0 bg-white" sandbox="allow-scripts" srcDoc={document} />;
}
