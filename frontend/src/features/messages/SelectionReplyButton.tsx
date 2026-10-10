/** Selection reply placement and interaction adapted from Mu (Apache-2.0). */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Globe, Quote } from "lucide-react";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { useSessionMessages } from "./SessionMessagesContext";

interface SelectionReply { readonly top: number; readonly left: number; readonly messageId: string; readonly content: string; readonly url: string | null; }

function replyContent(node: Node | null): HTMLElement | null {
  return (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>("[data-reply-content]") ?? null;
}

function selectionUrl(text: string, start: Node | null, end: Node | null): string | null {
  const startLink = (start instanceof Element ? start : start?.parentElement)?.closest<HTMLAnchorElement>("a[href]");
  const endLink = (end instanceof Element ? end : end?.parentElement)?.closest<HTMLAnchorElement>("a[href]");
  const value = startLink !== undefined && startLink !== null && startLink === endLink ? startLink.href : text;
  if (!/^https?:\/\/\S+$/i.test(value)) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  return ["http:", "https:"].includes(url.protocol) && url.username === "" && url.password === "" ? url.href : null;
}

export function SelectionReplyButton() {
  const session = useSessionWorkspace();
  const { messagesQuery, changeQuote, requestFrozen, mutation } = useSessionMessages();
  const [position, setPosition] = useState<SelectionReply | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const messages = useRef(messagesQuery.data);
  messages.current = messagesQuery.data;
  const content = zhCN.conversation.reply;
  useLayoutEffect(() => {
    if (position === null || buttonRef.current === null) return;
    const width = buttonRef.current.getBoundingClientRect().width;
    const left = Math.max(width / 2 + 8, Math.min(position.left, window.innerWidth - width / 2 - 8));
    if (Math.abs(left - position.left) > 1) setPosition({ ...position, left });
  }, [position]);
  useEffect(() => {
    if (session.archived || requestFrozen || mutation.isPending) { setPosition(null); return; }
    const mobile = window.matchMedia("(max-width: 720px)");
    let selectTimer: ReturnType<typeof setTimeout> | null = null, scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => setPosition(null);
    const select = (event: MouseEvent) => {
      if (mobile.matches || buttonRef.current?.contains(event.target as Node)) return;
      if (selectTimer !== null) clearTimeout(selectTimer);
      selectTimer = setTimeout(() => {
        const input = document.querySelector<HTMLTextAreaElement>("[data-composer-input]");
        if (input === null || input.disabled || input.dataset.composerInput !== session.id) { clear(); return; }
        const selected = document.getSelection();
        if (selected === null || selected.isCollapsed || selected.rangeCount !== 1 || selected.toString().trim() === "") { clear(); return; }
        const start = replyContent(selected.anchorNode), end = replyContent(selected.focusNode);
        if (start === null || start !== end) { clear(); return; }
        const messageId = start.dataset.replyContent;
        if (messageId === undefined || !messages.current?.some((message) => message.id === messageId && message.session_id === session.id)) { clear(); return; }
        const text = selected.toString().trim(), rect = selected.getRangeAt(0).getBoundingClientRect();
        setPosition({ top: Math.max(8, Math.min(rect.top - 40 >= 0 ? rect.top - 40 : rect.bottom + 8, window.innerHeight - 40)), left: Math.max(60, Math.min(rect.left + rect.width / 2, window.innerWidth - 60)), messageId, content: text, url: selectionUrl(text, selected.anchorNode, selected.focusNode) });
      }, 20);
    };
    const down = (event: MouseEvent) => { if (!buttonRef.current?.contains(event.target as Node)) clear(); };
    const scroll = () => { if (scrollTimer !== null) clearTimeout(scrollTimer); scrollTimer = setTimeout(clear, 100); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") clear(); };
    const resize = () => clear();
    document.addEventListener("mouseup", select); document.addEventListener("mousedown", down); document.addEventListener("scroll", scroll, true); document.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => { if (selectTimer !== null) clearTimeout(selectTimer); if (scrollTimer !== null) clearTimeout(scrollTimer); document.removeEventListener("mouseup", select); document.removeEventListener("mousedown", down); document.removeEventListener("scroll", scroll, true); document.removeEventListener("keydown", key); window.removeEventListener("resize", resize); };
  }, [session.id, session.archived, requestFrozen, mutation.isPending]);
  if (position === null) return null;
  function dismiss() { setPosition(null); document.getSelection()?.removeAllRanges(); }
  const item = "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--brand-hover)] focus-visible:outline-2 focus-visible:outline-offset-1";
  return createPortal(<div ref={buttonRef} className="fixed z-[9999] flex select-none items-center gap-0.5 rounded-lg border border-[var(--brand-hover)] bg-[var(--brand-light)] p-1 text-[var(--brand)] shadow-[0_2px_8px_rgba(0,0,0,0.12)]" style={{ top: position.top, left: position.left, transform: "translateX(-50%)" }} data-selection-reply>
    <button type="button" className={item} onMouseDown={(event) => event.preventDefault()} onClick={() => { changeQuote({ messageId: position.messageId, content: position.content }); dismiss(); document.querySelector<HTMLTextAreaElement>("[data-composer-input]")?.focus(); }}><Quote className="size-3.5"/>{content.action}</button>
    {position.url !== null && <button type="button" className={item} onMouseDown={(event) => event.preventDefault()} onClick={() => { window.open(position.url!, "_blank", "noreferrer"); dismiss(); }}><Globe className="size-3.5"/>{content.openLink}</button>}
  </div>, document.body);
}
