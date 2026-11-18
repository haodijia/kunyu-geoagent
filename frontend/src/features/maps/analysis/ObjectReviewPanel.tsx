import { useNavigation } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  AnalysisOutput,
  ObjectReviewProfile,
} from "@/features/analysis/api";
import { workspaceOverviewPath } from "@/features/workspaces/routes";
import { objectReview as copy } from "@/locales/zh-CN/object-review";
import { skipToken, useQuery } from "@tanstack/vue-query";
import { LocateFixed, X } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
import {
  listReviewDatasets,
  reviewObjects,
  type ObjectReviewItem,
} from "./object-review";

type ReviewInput = Parameters<typeof reviewObjects>[2];

export const ObjectReviewPanel = defineComponent(
  (props: {
    readonly output: AnalysisOutput;
    readonly sessionId: string;
    readonly selected: ObjectReviewItem | null;
    readonly onLocate: (item: ObjectReviewItem) => void;
    readonly onClear: () => void;
    readonly onClose: () => void;
  }) => {
    const navigate = useNavigation();
    const filePath = shallowRef("");
    const term = shallowRef("");
    const input = shallowRef<ReviewInput | null>(null);
    const datasets = reactive(
      useQuery(
        computed(() => {
          const { workspace_id, id } = props.output;
          return {
            queryKey: ["object-review-datasets", workspace_id, id],
            queryFn: ({ signal }: { signal: AbortSignal }) =>
              listReviewDatasets(workspace_id, id, signal),
            retry: false,
          };
        }),
      ),
    );
    const review = reactive(
      useQuery(
        computed(() => {
          const { workspace_id, id } = props.output;
          const submitted = input.value;
          return {
            queryKey: ["object-review", workspace_id, id, submitted],
            queryFn:
              submitted === null
                ? skipToken
                : ({ signal }: { signal: AbortSignal }) =>
                    reviewObjects(workspace_id, id, submitted, signal),
            retry: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          };
        }),
      ),
    );

    return () => {
      const result =
        review.isFetching || review.isError ? undefined : review.data;
      return (
        <section
          class="map-inspection map-object-review p-3"
          aria-label={copy.title}
        >
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <h2 class="m-0 text-sm font-semibold">{copy.title}</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={copy.close}
                onClick={props.onClose}
              >
                <X class="size-3.5" />
              </Button>
            </div>
            <p
              class="m-0 truncate text-xs text-muted-foreground"
              title={props.output.title}
            >
              {props.output.title}
            </p>
            {datasets.isPending && (
              <p role="status" class="m-0 text-xs text-muted-foreground">
                {copy.loadingDatasets}
              </p>
            )}
            {datasets.isError && (
              <p role="alert" class="m-0 text-xs text-destructive">
                {datasets.error.message}
              </p>
            )}
            {datasets.data?.length === 0 && (
              <div class="space-y-2 text-xs text-muted-foreground">
                <p class="m-0">{copy.noDatasets}</p>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() =>
                    void navigate(
                      workspaceOverviewPath(props.output.workspace_id),
                      { state: { sessionId: props.sessionId } },
                    )
                  }
                >
                  {copy.openWorkspace}
                </Button>
              </div>
            )}
            {datasets.data && datasets.data.length > 0 && (
              <form
                class="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!filePath.value) return;
                  props.onClear();
                  const query = term.value.trim();
                  if (
                    input.value?.file_path === filePath.value &&
                    input.value.query === query
                  ) {
                    void review.refetch();
                    return;
                  }
                  input.value = { file_path: filePath.value, query };
                }}
              >
                <select
                  class="h-8 w-full truncate rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={copy.dataset}
                  value={filePath.value}
                  onChange={(event) => {
                    filePath.value = (
                      event.currentTarget as HTMLSelectElement
                    ).value;
                    input.value = null;
                    props.onClear();
                  }}
                >
                  <option value="" disabled>
                    {copy.dataset}
                  </option>
                  {datasets.data.map((dataset) => (
                    <option key={dataset.file_path} value={dataset.file_path}>
                      {dataset.name}
                    </option>
                  ))}
                </select>
                <Input
                  class="h-8 text-xs"
                  aria-label={copy.search}
                  placeholder={copy.search}
                  maxlength={80}
                  value={term.value}
                  onInput={(event) => {
                    term.value = (
                      event.currentTarget as HTMLInputElement
                    ).value;
                  }}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!filePath.value || review.isFetching}
                >
                  {copy.submit}
                </Button>
              </form>
            )}
            {review.isFetching && (
              <p role="status" class="m-0 text-xs text-muted-foreground">
                {copy.loading}
              </p>
            )}
            {review.isError && (
              <p role="alert" class="m-0 text-xs text-destructive">
                {review.error.message}
              </p>
            )}
            {result?.items.length === 0 && (
              <p class="m-0 text-xs text-muted-foreground">{copy.empty}</p>
            )}
            {result && result.items.length > 0 && (
              <>
                <ul class="m-0 grid list-none gap-1 p-0">
                  {result.items.map((item) => (
                    <li key={`${item.kind}:${item.name}`}>
                      <ReviewRow
                        item={item}
                        profile={result.profile}
                        selected={item === props.selected}
                        onLocate={() => props.onLocate(item)}
                      />
                    </li>
                  ))}
                </ul>
                <p class="m-0 text-[11px] leading-4 text-muted-foreground">
                  {copy.evidence}
                </p>
                {result.attribution && (
                  <p class="m-0 text-[11px] text-muted-foreground">
                    {result.attribution}
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      );
    };
  },
  {
    name: "ObjectReviewPanel",
    props: [
      "output",
      "sessionId",
      "selected",
      "onLocate",
      "onClear",
      "onClose",
    ],
  },
);

const ReviewRow = defineComponent(
  (props: {
    readonly item: ObjectReviewItem;
    readonly profile: ObjectReviewProfile;
    readonly selected: boolean;
    readonly onLocate: () => void;
  }) =>
    () => {
      const { item, profile } = props;
      const format = copy[item.kind];
      return (
        <button
          type="button"
          aria-label={copy.locate(item.name)}
          aria-pressed={props.selected}
          onClick={props.onLocate}
          class="flex w-full items-start gap-2 rounded-md border border-border px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-accent"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-medium">{item.name}</span>
            <span class="block text-[11px] leading-4 text-muted-foreground">
              {profile.candidate_label} {format(item.candidate)}
            </span>
            {item.evidence !== null && item.evidence > 0 && (
              <span class="block text-[11px] text-muted-foreground">
                {profile.evidence_label} {format(item.evidence)}
              </span>
            )}
            {item.missing > 0 && (
              <span class="block text-[11px] text-muted-foreground">
                {profile.missing_label} {format(item.missing)}
              </span>
            )}
            {item.ambiguous > 0 && (
              <span class="block text-[11px] text-muted-foreground">
                {profile.ambiguous_label} {format(item.ambiguous)}
              </span>
            )}
            {props.selected && (
              <span class="mt-1 block text-[11px] text-muted-foreground">
                {copy.covered} {format(item.covered)} / {format(item.extent)}
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
  { name: "ReviewRow", props: ["item", "profile", "selected", "onLocate"] },
);
