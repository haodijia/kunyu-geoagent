import { useNavigation } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnalysisOutput } from "@/features/analysis/api";
import {
  getWaterReview,
  type WaterReviewItem,
} from "@/features/maps/analysis/water-review";
import { workspaceOverviewPath } from "@/features/workspaces/routes";
import { waterReview as copy } from "@/locales/zh-CN/water-review";
import { useQuery } from "@tanstack/vue-query";
import { LocateFixed, Search, X } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";

export const WaterReviewPanel = defineComponent(
  (props: {
    readonly output: AnalysisOutput;
    readonly selected: WaterReviewItem | null;
    readonly onLocate: (item: WaterReviewItem) => void;
    readonly onClear: () => void;
  }) => {
    const navigate = useNavigation();
    const input = shallowRef("");
    const query = shallowRef("");
    const review = reactive(
      useQuery(
        computed(() => {
          const { workspace_id, id, revision } = props.output;
          const term = query.value;
          return {
            queryKey: [
              "water-review",
              workspace_id,
              id,
              revision,
              term,
            ] as const,
            queryFn: ({ signal }: { signal: AbortSignal }) =>
              getWaterReview(workspace_id, id, term, signal),
            retry: false,
          };
        }),
      ),
    );
    const attribution = computed(() =>
      [
        ...new Set(
          review.data?.items.flatMap((item) =>
            item.attribution ? [item.attribution] : [],
          ) ?? [],
        ),
      ].join(" · "),
    );
    return () => (
      <section class="map-inspection map-water-review" aria-label={copy.title}>
        <div class="space-y-2 p-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="m-0 text-sm font-semibold">{copy.title}</h2>
            {props.selected && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={copy.clearSelection}
                onClick={props.onClear}
              >
                <X class="size-3.5" />
              </Button>
            )}
          </div>
          <p class="m-0 text-xs leading-4 text-muted-foreground">
            {copy.description}
          </p>
          <form
            class="flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              props.onClear();
              query.value = input.value.trim();
            }}
          >
            <Input
              class="h-7 min-w-0 text-xs"
              aria-label={copy.search}
              placeholder={copy.search}
              maxlength={80}
              value={input.value}
              onInput={(event) => {
                input.value = (event.currentTarget as HTMLInputElement).value;
                if (input.value === "") query.value = "";
              }}
            />
            <Button
              type="submit"
              variant="outline"
              size="icon-sm"
              aria-label={copy.submitSearch}
            >
              <Search class="size-3.5" />
            </Button>
          </form>
          {review.isPending ? (
            <p role="status" class="m-0 text-xs text-muted-foreground">
              {copy.loading}
            </p>
          ) : review.isError ? (
            <div role="alert" class="space-y-1 text-xs text-destructive">
              <p class="m-0">{review.error.message || copy.failed}</p>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => void review.refetch()}
              >
                {copy.retry}
              </Button>
            </div>
          ) : review.data.datasets.length === 0 ? (
            <div class="space-y-1 text-xs text-muted-foreground">
              <p class="m-0">{copy.noDatasets}</p>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() =>
                  void navigate(
                    workspaceOverviewPath(props.output.workspace_id),
                  )
                }
              >
                {copy.openWorkspace}
              </Button>
            </div>
          ) : review.data.items.length === 0 ? (
            <p class="m-0 text-xs text-muted-foreground">{copy.empty}</p>
          ) : (
            <>
              <ul class="m-0 grid list-none gap-1 p-0">
                {review.data.items.map((item) => (
                  <li key={`${item.kind}:${item.source}:${item.name}`}>
                    <ReviewRow
                      item={item}
                      selected={
                        item.name === props.selected?.name &&
                        item.kind === props.selected.kind &&
                        item.source === props.selected.source
                      }
                      onLocate={() => props.onLocate(item)}
                    />
                  </li>
                ))}
              </ul>
              <p class="m-0 text-[11px] leading-4 text-muted-foreground">
                {copy.roadEstimate} {copy.evidence}
              </p>
              {attribution.value && (
                <p class="m-0 text-[11px] text-muted-foreground">
                  {attribution.value}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    );
  },
  {
    name: "WaterReviewPanel",
    props: ["output", "selected", "onLocate", "onClear"],
  },
);

const ReviewRow = defineComponent(
  (props: {
    readonly item: WaterReviewItem;
    readonly selected: boolean;
    readonly onLocate: () => void;
  }) =>
    () => {
      const { item } = props;
      const format = item.kind === "park" ? copy.area : copy.length;
      return (
        <button
          type="button"
          aria-label={copy.locate(item.name)}
          aria-pressed={props.selected}
          title={item.source}
          onClick={props.onLocate}
          class="flex w-full items-start gap-2 rounded-md border border-border px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-accent"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-medium">{item.name}</span>
            <span class="block text-[11px] leading-4 text-muted-foreground">
              {copy[item.kind]} · {copy.candidate} {format(item.candidate)}
            </span>
            {item.stable > 0 && (
              <span class="block text-[11px] leading-4 text-muted-foreground">
                {copy.stable} {format(item.stable)}
              </span>
            )}
            {item.missing > 0 && (
              <span class="block text-[11px] leading-4 text-muted-foreground">
                {copy.missing} {format(item.missing)}
              </span>
            )}
            {item.disagreement > 0 && (
              <span class="block text-[11px] leading-4 text-muted-foreground">
                {copy.disagreement} {format(item.disagreement)}
              </span>
            )}
            {props.selected && (
              <span class="mt-1 block text-[11px] leading-4 text-muted-foreground">
                {copy.covered} {format(item.covered)} / {format(item.extent)} ·{" "}
                {item.source}
              </span>
            )}
          </span>
          <LocateFixed
            class="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      );
    },
  { name: "ReviewRow", props: ["item", "selected", "onLocate"] },
);
