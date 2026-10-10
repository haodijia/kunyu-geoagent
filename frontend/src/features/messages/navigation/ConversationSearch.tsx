/** Search presentation adapted from Mu's ConversationTitleMinimap (Apache-2.0). */
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";
import { cn } from "@/lib/utils";
import { useMessageNavigation } from "./MessageNavigationContext";
import { matchesAnchor, normalize, searchSnippet } from "./model";
import styles from "./ConversationSearch.module.css";

const content = zhCN.conversation.navigation;
function Highlight({ text, query }: { readonly text: string; readonly query: string }) {
  const snippet = searchSnippet(text, query);
  if (query === "") return snippet;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return snippet.split(new RegExp(`(${escaped})`, "gi")).map((part, index) => part.toLowerCase() === query.toLowerCase() ? <strong key={index} className="font-extrabold text-[var(--mu-primary-fill)]">{part}</strong> : part);
}

export function ConversationSearch() {
  const navigation = useMessageNavigation();
  const [query, setQuery] = useState(""), [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null), listRef = useRef<HTMLDivElement>(null), jumping = useRef(false);
  const keyword = normalize(query);
  const results = useMemo(() => navigation.anchors.filter((anchor) => matchesAnchor(anchor, keyword)), [navigation.anchors, keyword]);
  const selected = Math.min(activeIndex, Math.max(0, results.length - 1));
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f" && !event.isComposing) {
        event.preventDefault(); navigation.setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [navigation.setSearchOpen]);
  useEffect(() => {
    if (navigation.searchOpen) listRef.current?.querySelector<HTMLElement>(`[data-search-result="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected, navigation.searchOpen]);
  function select(index: number) {
    jumping.current = true;
    navigation.jump(results[index]!.messageId);
  }
  return <Popover open={navigation.searchOpen} onOpenChange={navigation.setSearchOpen}>
    <PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-6 shrink-0 rounded-full border border-transparent text-t-secondary hover:border-border hover:bg-fill-3" aria-label={content.search} title={content.search} data-conversation-search><Search className="size-[15px]"/></Button></PopoverTrigger>
    <PopoverContent className={cn(styles.panel, "p-0")} side="bottom" align="center" sideOffset={8} aria-label={content.search}
      onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}
      onCloseAutoFocus={(event) => { if (jumping.current) { event.preventDefault(); jumping.current = false; } }}>
      <div className={styles.header}>
        <div className={styles.input}>
          <Search className="size-3.5 shrink-0 text-t-secondary"/>
          <Input ref={inputRef} value={query} aria-label={content.search} placeholder={content.searchHint} className="h-full min-w-0 border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0" onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault(); setActiveIndex((current) => Math.min(Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)), Math.max(0, results.length - 1)));
              } else if (event.key === "Enter" && results.length > 0) { event.preventDefault(); select(selected); }
            }}/>
          {query !== "" && <button type="button" className="flex size-4 shrink-0 items-center justify-center rounded-full text-t-secondary hover:bg-fill-2" aria-label={content.clear} onClick={() => { setQuery(""); setActiveIndex(0); inputRef.current?.focus(); }}><X className="size-3"/></button>}
        </div>
        <span className={cn("shrink-0 text-xs font-semibold", keyword !== "" && "text-[var(--mu-primary-fill)]")} aria-live="polite">{keyword === "" ? content.count(navigation.anchors.length) : `${results.length}/${navigation.anchors.length}`}</span>
      </div>
      <div ref={listRef} className={styles.results}>
        {navigation.loading && <p className="p-5 text-center text-sm text-t-secondary">{zhCN.conversation.loading}</p>}
        {navigation.error !== null && <div className="p-5 text-center text-sm"><p role="alert" className="text-destructive">{zhCN.conversation.loadFailed}</p><Button variant="ghost" onClick={navigation.retry}>{zhCN.conversation.retry}</Button></div>}
        {!navigation.loading && navigation.error === null && results.length === 0 && <p className="p-5 text-center text-sm text-t-secondary">{navigation.anchors.length === 0 ? content.empty : content.noMatch}</p>}
        {navigation.error === null && results.map((anchor, index) => <button key={anchor.messageId} type="button" data-search-result={index} aria-current={selected === index ? "true" : undefined} className={cn(styles.result, selected === index && styles.active)} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(index)}>
          <span className="mb-0.5 block text-[11px] text-t-secondary">#{anchor.index}</span>
          <span className="block text-[13px] font-medium leading-[18px] text-t-primary">{content.question} <Highlight text={anchor.question} query={keyword}/></span>
          {anchor.answer !== "" && <span className="mt-0.5 block text-xs leading-[18px] text-t-secondary">{content.answer} <Highlight text={anchor.answer} query={keyword}/></span>}
        </button>)}
      </div>
    </PopoverContent>
  </Popover>;
}
