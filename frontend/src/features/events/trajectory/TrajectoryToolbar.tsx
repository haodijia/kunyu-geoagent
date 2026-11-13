import { computed, defineComponent } from "vue";
/** Trajectory toolbar: timeline and ledger fold controls. */

import css from "@/features/events/trajectory/styles/TrajectoryToolbar.module.css";
import type { TrajectoryTranslate } from "@/features/events/trajectory/trajectory-locales";
import { Search as IconSearchOutlineRegular } from "lucide-vue-next";
export interface TrajectoryToolbarProps {
  /** Whether timeline blocks use recorded durations instead of equal widths. */
  actualDuration: boolean;
  /** Select recorded-duration or equal-width blocks. */
  onActualDurationChange: (actualDuration: boolean) => void;
  /** Whether recorded timing retains idle gaps between operations. */
  actualTime: boolean;
  /** Select complete wall-clock timing or idle-compressed timing. */
  onActualTimeChange: (actualTime: boolean) => void;
  /** Whether every collapsible turn is currently folded. */
  allTurnsCollapsed: boolean;
  /** Fold or expand every collapsible turn. */
  onToggleAllTurns: () => void;
  /** Whether every collapsible assistant's tool calls are currently folded. */
  allAssistantsCollapsed: boolean;
  /** Fold or expand tool calls under every collapsible assistant. */
  onToggleAllAssistants: () => void;
  canCollapseTurns: boolean;
  canCollapseCalls: boolean;
  /** Current live ledger search query. */
  searchQuery: string;
  /** Update the live ledger search query. */
  onSearchQueryChange: (query: string) => void;
  /** Translate a toolbar dictionary key. */
  t: TrajectoryTranslate;
}

/**
 * Render the sticky trajectory toolbar.
 * @param props - rendered counts and whole-list fold state.
 * @returns the toolbar element.
 */
export const TrajectoryToolbar = defineComponent(
  (componentProps: TrajectoryToolbarProps, { slots: _slots }) => {
    const actualDuration = computed(() => componentProps.actualDuration),
      onActualDurationChange = computed(
        () => componentProps.onActualDurationChange,
      ),
      actualTime = computed(() => componentProps.actualTime),
      onActualTimeChange = computed(() => componentProps.onActualTimeChange),
      allTurnsCollapsed = computed(() => componentProps.allTurnsCollapsed),
      onToggleAllTurns = computed(() => componentProps.onToggleAllTurns),
      allAssistantsCollapsed = computed(
        () => componentProps.allAssistantsCollapsed,
      ),
      onToggleAllAssistants = computed(
        () => componentProps.onToggleAllAssistants,
      ),
      canCollapseTurns = computed(() => componentProps.canCollapseTurns),
      canCollapseCalls = computed(() => componentProps.canCollapseCalls),
      searchQuery = computed(() => componentProps.searchQuery),
      onSearchQueryChange = computed(() => componentProps.onSearchQueryChange),
      t = computed(() => componentProps.t);
    return () => {
      const _t = t.value,
        _actualDuration = actualDuration.value,
        _onActualDurationChange = onActualDurationChange.value,
        _actualTime = actualTime.value,
        _onActualTimeChange = onActualTimeChange.value,
        _canCollapseTurns = canCollapseTurns.value,
        _allTurnsCollapsed = allTurnsCollapsed.value,
        _onToggleAllTurns = onToggleAllTurns.value,
        _canCollapseCalls = canCollapseCalls.value,
        _allAssistantsCollapsed = allAssistantsCollapsed.value,
        _onToggleAllAssistants = onToggleAllAssistants.value,
        _searchQuery = searchQuery.value,
        _onSearchQueryChange = onSearchQueryChange.value;
      return (
        <div class={css.root} role="toolbar" aria-label={_t("toolbar.aria")}>
          <div class={css.inner}>
            <div class={css.actions}>
              <button
                type="button"
                class={css.toggle}
                aria-label={_t("toolbar.useActualDuration")}
                aria-pressed={_actualDuration}
                title={
                  _actualDuration
                    ? _t("toolbar.useEqualWidth")
                    : _t("toolbar.useActualDuration")
                }
                onClick={() => {
                  _onActualDurationChange(!_actualDuration);
                }}
              >
                <svg
                  class={css.toggleIcon}
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="8" r="5.25" />
                  <path d="M8 4.75V8l2.25 1.5" />
                </svg>
                {_t("toolbar.duration")}
              </button>
              <button
                type="button"
                class={css.control}
                role="switch"
                aria-checked={_actualTime}
                hidden
                onClick={() => {
                  _onActualTimeChange(!_actualTime);
                }}
              >
                <span>{_t("toolbar.actualTime")}</span>
                <span
                  class={css.controlTrack}
                  data-on={_actualTime || undefined}
                  aria-hidden="true"
                >
                  <span class={css.controlThumb} />
                </span>
              </button>
              <button
                type="button"
                class={css.action}
                disabled={!_canCollapseTurns}
                aria-label={
                  _allTurnsCollapsed
                    ? _t("toolbar.expandTurns")
                    : _t("toolbar.collapseTurns")
                }
                aria-pressed={_allTurnsCollapsed}
                title={
                  _allTurnsCollapsed
                    ? _t("toolbar.expandTurns")
                    : _t("toolbar.collapseTurns")
                }
                onClick={_onToggleAllTurns}
              >
                <span class={css.actionIcon} aria-hidden="true">
                  {_allTurnsCollapsed ? "⊞" : "⊟"}
                </span>
                {_t("toolbar.turns")}
              </button>
              <button
                type="button"
                class={css.action}
                disabled={!_canCollapseCalls}
                aria-label={
                  _allAssistantsCollapsed
                    ? _t("toolbar.expandCalls")
                    : _t("toolbar.collapseCalls")
                }
                aria-pressed={_allAssistantsCollapsed}
                title={
                  _allAssistantsCollapsed
                    ? _t("toolbar.expandCalls")
                    : _t("toolbar.collapseCalls")
                }
                onClick={_onToggleAllAssistants}
              >
                <span class={css.actionIcon} aria-hidden="true">
                  {_allAssistantsCollapsed ? "⊞" : "⊟"}
                </span>
                {_t("toolbar.calls")}
              </button>
            </div>
            <div class={css.search}>
              <IconSearchOutlineRegular size={11} class={css.searchIcon} />
              <input
                type="search"
                class={css.searchInput}
                aria-label={_t("toolbar.search")}
                placeholder={_t("toolbar.searchPlaceholder")}
                value={_searchQuery}
                onInput={(event) => {
                  _onSearchQueryChange(
                    (event.currentTarget as HTMLInputElement).value,
                  );
                }}
              />
            </div>
          </div>
        </div>
      );
    };
  },
  {
    name: "TrajectoryToolbar",
    inheritAttrs: false,
    props: [
      "actualDuration",
      "onActualDurationChange",
      "actualTime",
      "onActualTimeChange",
      "allTurnsCollapsed",
      "onToggleAllTurns",
      "allAssistantsCollapsed",
      "onToggleAllAssistants",
      "canCollapseTurns",
      "canCollapseCalls",
      "searchQuery",
      "onSearchQueryChange",
      "t",
    ],
  },
);
