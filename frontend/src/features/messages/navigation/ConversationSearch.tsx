import { refSetter, watchMounted } from "@/lib/lifecycle";
import { computed, defineComponent, shallowRef } from "vue";
/** Search presentation adapted from Mu's ConversationTitleMinimap (Apache-2.0). */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import styles from "@/features/messages/navigation/ConversationSearch.module.css";
import { useMessageNavigation } from "@/features/messages/navigation/MessageNavigationContext";
import {
  matchesAnchor,
  normalize,
  searchSnippet,
} from "@/features/messages/navigation/model";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import { Search, X } from "lucide-vue-next";
const content = zhCN.conversation.navigation;
const Highlight = defineComponent(
  (
    componentProps: {
      readonly text: string;
      readonly query: string;
    },
    { slots: _slots },
  ) => {
    const text = computed(() => componentProps.text),
      query = computed(() => componentProps.query);
    const snippet = computed(() => searchSnippet(text.value, query.value));
    const escaped = computed(() =>
      query.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    return () => {
      const _query = query.value,
        _snippet = snippet.value,
        _escaped = escaped.value;
      if (_query === "") return _snippet;
      return _snippet
        .split(new RegExp(`(${_escaped})`, "gi"))
        .map((part, index) =>
          part.toLowerCase() === _query.toLowerCase() ? (
            <strong
              key={index}
              class="font-extrabold text-[var(--mu-primary-fill)]"
            >
              {part}
            </strong>
          ) : (
            part
          ),
        );
    };
  },
  {
    name: "Highlight",
    inheritAttrs: false,
    props: ["text", "query"],
  },
);
export const ConversationSearch = defineComponent(
  (_props, { slots: _slots }) => {
    const navigation = useMessageNavigation();
    const query = shallowRef(""),
      activeIndex = shallowRef(0),
      setQuery = refSetter(query),
      setActiveIndex = refSetter(activeIndex);
    const inputRef = shallowRef<HTMLInputElement | null>(null),
      listRef = shallowRef<HTMLDivElement | null>(null),
      jumping = shallowRef(false);
    const keyword = computed(() => normalize(query.value));
    const results = computed(() =>
      navigation.anchors.filter((anchor) =>
        matchesAnchor(anchor, keyword.value),
      ),
    );
    const selected = computed(() =>
      Math.min(activeIndex.value, Math.max(0, results.value.length - 1)),
    );
    watchMounted([() => navigation.setSearchOpen], () => {
      const handle = (event: KeyboardEvent) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "f" &&
          !event.isComposing
        ) {
          event.preventDefault();
          navigation.setSearchOpen(true);
        }
      };
      document.addEventListener("keydown", handle);
      return () => document.removeEventListener("keydown", handle);
    });
    watchMounted([() => selected.value, () => navigation.searchOpen], () => {
      if (navigation.searchOpen)
        listRef.value
          ?.querySelector<HTMLElement>(
            `[data-search-result="${selected.value}"]`,
          )
          ?.scrollIntoView({
            block: "nearest",
          });
    });
    function select(index: number) {
      jumping.value = true;
      navigation.jump(results.value[index]!.messageId);
    }
    return () => {
      const _results = results.value,
        _selected = selected.value,
        _keyword = keyword.value;
      return (
        <Popover
          open={navigation.searchOpen}
          onUpdate:open={navigation.setSearchOpen}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="size-7 shrink-0 rounded-md text-t-secondary hover:bg-fill-3"
              aria-label={content.search}
              title={content.search}
              data-conversation-search
            >
              <Search class="size-[18px]" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            class={cn(styles.panel, "p-0")}
            side="bottom"
            align="start"
            sideOffset={10}
            collisionPadding={16}
            aria-label={content.search}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.value?.focus();
            }}
            onCloseAutoFocus={(event) => {
              if (jumping.value) {
                event.preventDefault();
                jumping.value = false;
              }
            }}
          >
            <div class={styles.header}>
              <div class={styles.input}>
                <Search class="size-3.5 shrink-0 text-t-secondary" />
                <Input
                  ref={inputRef}
                  value={query.value}
                  aria-label={content.search}
                  placeholder={content.searchHint}
                  class="h-full min-w-0 border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
                  onInput={(event) => {
                    setQuery((event.target as HTMLInputElement).value);
                    setActiveIndex(0);
                  }}
                  onKeydown={(event) => {
                    if (event.isComposing) return;
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveIndex((current) =>
                        Math.min(
                          Math.max(
                            0,
                            current + (event.key === "ArrowDown" ? 1 : -1),
                          ),
                          Math.max(0, _results.length - 1),
                        ),
                      );
                    } else if (event.key === "Enter" && _results.length > 0) {
                      event.preventDefault();
                      select(_selected);
                    }
                  }}
                />
                {query.value !== "" && (
                  <button
                    type="button"
                    class="flex size-4 shrink-0 items-center justify-center rounded-full text-t-secondary hover:bg-fill-2"
                    aria-label={content.clear}
                    onClick={() => {
                      setQuery("");
                      setActiveIndex(0);
                      inputRef.value?.focus();
                    }}
                  >
                    <X class="size-3" />
                  </button>
                )}
              </div>
              <span
                class={cn(
                  "shrink-0 text-xs font-semibold",
                  _keyword !== "" && "text-[var(--mu-primary-fill)]",
                )}
                aria-live="polite"
              >
                {_keyword === ""
                  ? content.count(navigation.anchors.length)
                  : `${_results.length}/${navigation.anchors.length}`}
              </span>
            </div>
            <div ref={listRef} class={styles.results}>
              {navigation.loading && (
                <p class="p-5 text-center text-sm text-t-secondary">
                  {zhCN.conversation.loading}
                </p>
              )}
              {navigation.error !== null && (
                <div class="p-5 text-center text-sm">
                  <p role="alert" class="text-destructive">
                    {zhCN.conversation.loadFailed}
                  </p>
                  <Button variant="ghost" onClick={navigation.retry}>
                    {zhCN.conversation.retry}
                  </Button>
                </div>
              )}
              {!navigation.loading &&
                navigation.error === null &&
                _results.length === 0 && (
                  <p class="p-5 text-center text-sm text-t-secondary">
                    {navigation.anchors.length === 0
                      ? content.empty
                      : content.noMatch}
                  </p>
                )}
              {navigation.error === null &&
                _results.map((anchor, index) => (
                  <button
                    key={anchor.messageId}
                    type="button"
                    data-search-result={index}
                    aria-current={_selected === index ? "true" : undefined}
                    class={cn(
                      styles.result,
                      _selected === index && styles.active,
                    )}
                    onMouseenter={() => setActiveIndex(index)}
                    onClick={() => select(index)}
                  >
                    <span class="mb-0.5 block text-[11px] text-t-secondary">
                      #{anchor.index}
                    </span>
                    <span class="block text-[13px] font-medium leading-[18px] text-t-primary">
                      {content.question}{" "}
                      <Highlight text={anchor.question} query={_keyword} />
                    </span>
                    {anchor.answer !== "" && (
                      <span class="mt-0.5 block text-xs leading-[18px] text-t-secondary">
                        {content.answer}{" "}
                        <Highlight text={anchor.answer} query={_keyword} />
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </PopoverContent>
        </Popover>
      );
    };
  },
  {
    name: "ConversationSearch",
    inheritAttrs: false,
    props: [],
  },
);
