import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import type {
  AnalysisOutput,
  ObjectReviewProfile,
} from "@/features/analysis/api";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { objectReview as copy } from "@/locales/zh-CN/object-review";
import { skipToken, useQuery } from "@tanstack/vue-query";
import { Eye, EyeOff } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
import { FieldObservationSection } from "./FieldObservationSection";
import {
  fetchObjectVectors,
  inspectVector,
  type ObjectMeasurement,
  type ReviewVector,
} from "./object-review";
import { useReviewOverlay } from "./useReviewOverlay";

export const ObjectReviewPanel = defineComponent(
  (props: {
    readonly output: AnalysisOutput;
    readonly map: ReturnType<typeof useSessionMap>;
    readonly layerId: string | null;
    readonly inspectable: boolean;
  }) => {
    const session = useSessionWorkspace();
    const ui = useAppUiStore();
    const vectors = reactive(
      useQuery(
        computed(() => ({
          queryKey: [
            "object-vectors",
            props.output.workspace_id,
            props.output.id,
          ],
          queryFn: ({ signal }: { signal: AbortSignal }) =>
            fetchObjectVectors(props.output, signal),
          staleTime: Infinity,
        })),
      ),
    );
    const reference = computed(() => {
      const ref = ui.mapContextBySession[session.id]?.selection?.object;
      return ref?.output_id === props.output.id ? ref : null;
    });
    const featuresById = computed(
      () =>
        new Map(vectors.data?.features.map((feature) => [feature.id, feature])),
    );
    const selected = computed(() => {
      const ref = reference.value;
      return ref === null
        ? null
        : (featuresById.value.get(`${ref.dataset_id}:${ref.feature_index}`) ??
            null);
    });
    const preview = shallowRef<ReviewVector | null>(null);
    const choices = shallowRef<ReviewVector[]>([]);
    const visible = shallowRef(true);
    const review = reactive(
      useQuery(
        computed(() => {
          const feature = selected.value;
          return {
            queryKey: [
              "object-review",
              props.output.workspace_id,
              props.output.id,
              feature?.id,
            ],
            queryFn:
              feature === null
                ? skipToken
                : ({ signal }: { signal: AbortSignal }) =>
                    inspectVector(props.output, feature.properties, signal),
            staleTime: Infinity,
            retry: false,
          };
        }),
      ),
    );

    function select(feature: ReviewVector) {
      choices.value = [];
      preview.value = null;
      const { dataset_id, feature_index, name } = feature.properties;
      ui.setMapSelection(session.id, {
        object: { output_id: props.output.id, dataset_id, feature_index },
        name,
        layer_id: props.layerId,
      });
    }

    useReviewOverlay(
      () => props.map.getMap(),
      () => props.map.ready,
      () =>
        visible.value && vectors.data?.features.length ? vectors.data : null,
      () => (preview.value ?? selected.value)?.properties ?? null,
      () => props.inspectable,
      (features) => {
        if (features.length === 1) {
          select(features[0]!);
        } else {
          preview.value = null;
          ui.setMapSelection(session.id, null);
          choices.value = features;
        }
      },
    );

    return () => {
      const profile = props.output.object_review;
      if (!props.inspectable || profile === null) return null;
      const catalog = vectors.data;
      const feature = selected.value;
      const result = review.data;
      return (
        <section
          class="map-inspection map-object-review space-y-2 p-3"
          aria-label={copy.title}
        >
          <h2 class="m-0 text-sm font-semibold">{copy.title}</h2>
          {vectors.isPending && (
            <p role="status" class="m-0 text-xs text-muted-foreground">
              {copy.loadingVectors}
            </p>
          )}
          {vectors.isError && (
            <p role="alert" class="m-0 text-xs text-destructive">
              {vectors.error.message}
            </p>
          )}
          {catalog && (
            <>
              {catalog.features.length > 0 && (
                <div class="space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-pressed={visible.value}
                      onClick={() => {
                        visible.value = !visible.value;
                        preview.value = null;
                        choices.value = [];
                      }}
                    >
                      {visible.value ? <Eye /> : <EyeOff />}
                      {copy.overlay}
                    </Button>
                    <span class="text-xs text-muted-foreground">
                      {copy.vectorCount(catalog.features.length)}
                    </span>
                  </div>
                  {visible.value &&
                    feature === null &&
                    choices.value.length === 0 && (
                      <p class="m-0 text-xs text-muted-foreground">
                        {copy.guidance}
                      </p>
                    )}
                </div>
              )}
              {catalog.coverage !== "full" && (
                <p class="m-0 text-xs text-muted-foreground">
                  {copy[catalog.coverage]}
                </p>
              )}
              {catalog.coverage !== "none" && catalog.features.length === 0 && (
                <p class="m-0 text-xs text-muted-foreground">{copy.empty}</p>
              )}
            </>
          )}
          {choices.value.length > 0 && (
            <div class="space-y-1">
              <p class="m-0 text-xs text-muted-foreground">{copy.choose}</p>
              <ul class="m-0 grid list-none gap-1 p-0">
                {choices.value.map((choice) => (
                  <li key={choice.id}>
                    <button
                      type="button"
                      class="flex w-full items-center justify-between gap-2 rounded border border-border px-2 py-1 text-left text-xs hover:bg-muted focus-visible:bg-muted"
                      onPointerenter={() => {
                        preview.value = choice;
                      }}
                      onPointerleave={() => {
                        preview.value = null;
                      }}
                      onFocus={() => {
                        preview.value = choice;
                      }}
                      onBlur={() => {
                        preview.value = null;
                      }}
                      onClick={() => select(choice)}
                    >
                      <span class="truncate">
                        {choice.properties.name ?? copy.unnamed}
                      </span>
                      <span class="shrink-0 text-muted-foreground">
                        {copy.kind[choice.properties.kind]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {feature && (
            <div class="space-y-1 rounded-md border border-border p-2 text-xs">
              <h3 class="m-0 font-semibold">
                {feature.properties.name ?? copy.unnamed} ·{" "}
                {copy.kind[feature.properties.kind]}
              </h3>
              {review.isPending && (
                <p role="status" class="m-0 text-muted-foreground">
                  {copy.loadingObject}
                </p>
              )}
              {review.isError && (
                <p role="alert" class="m-0 text-destructive">
                  {review.error.message}
                </p>
              )}
              {result && result.status === "measured" && (
                <Measurements
                  measurement={result.measurement}
                  profile={profile}
                  kind={feature.properties.kind}
                />
              )}
              {result && result.status !== "measured" && (
                <p class="m-0 text-muted-foreground">{copy[result.status]}</p>
              )}
              {reference.value && (
                <FieldObservationSection
                  key={feature.id}
                  reference={reference.value}
                />
              )}
            </div>
          )}
          {catalog && catalog.datasets.length > 0 && (
            <ul class="m-0 list-none space-y-1 p-0 text-[11px] text-muted-foreground">
              {catalog.datasets.map((source) => (
                <li key={source.id}>
                  {source.name} · {source.snapshot_at.slice(0, 10)} ·{" "}
                  <a
                    href={source.license_url}
                    class="underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.attribution} · {source.license}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    };
  },
  {
    name: "ObjectReviewPanel",
    props: ["output", "map", "layerId", "inspectable"],
  },
);

const Measurements = defineComponent(
  (props: {
    readonly measurement: ObjectMeasurement;
    readonly profile: ObjectReviewProfile;
    readonly kind: ReviewVector["properties"]["kind"];
  }) =>
    () => {
      const { measurement, profile, kind } = props;
      const format = copy[kind];
      return (
        <>
          <dl class="m-0 space-y-0.5">
            <Measurement
              label={profile.candidate_label}
              value={format(measurement.candidate)}
            />
            {measurement.evidence !== null &&
              profile.evidence_label !== null && (
                <Measurement
                  label={profile.evidence_label}
                  value={format(measurement.evidence)}
                />
              )}
            {measurement.missing > 0 && (
              <Measurement
                label={profile.missing_label}
                value={format(measurement.missing)}
              />
            )}
            {measurement.ambiguous > 0 && (
              <Measurement
                label={profile.ambiguous_label}
                value={format(measurement.ambiguous)}
              />
            )}
            <Measurement
              label={copy.covered}
              value={`${format(measurement.covered)} / ${format(measurement.extent)}`}
            />
          </dl>
          <p class="m-0 text-[11px] text-muted-foreground">
            {copy.evidence[kind]}
          </p>
        </>
      );
    },
  { name: "Measurements", props: ["measurement", "profile", "kind"] },
);

const Measurement = defineComponent(
  (props: { readonly label: string; readonly value: string }) => () => (
    <div class="flex justify-between gap-1">
      <dt class="text-muted-foreground">{props.label}</dt>
      <dd class="m-0 text-right tabular-nums">{props.value}</dd>
    </div>
  ),
  { name: "Measurement", props: ["label", "value"] },
);
