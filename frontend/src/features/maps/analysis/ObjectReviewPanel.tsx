import { Button } from "@/components/ui/button";
import type { ObjectReviewProfile } from "@/features/analysis/api";
import { objectReview as copy } from "@/locales/zh-CN/object-review";
import { LocateFixed, X } from "lucide-vue-next";
import { defineComponent, shallowRef } from "vue";
import type { ObjectReview, ObjectReviewItem } from "./object-review";

export const ObjectReviewPanel = defineComponent(
  (props: {
    readonly report: ObjectReview;
    readonly onLocate: (item: ObjectReviewItem) => void;
    readonly onClose: () => void;
  }) => {
    const selected = shallowRef<ObjectReviewItem | null>(null);
    return () => (
      <section
        class="map-inspection map-object-review space-y-2 p-3"
        aria-label={copy.title}
      >
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
          title={props.report.output_title}
        >
          {props.report.output_title}
        </p>
        {props.report.coverage === "partial" && (
          <p class="m-0 text-xs text-muted-foreground">{copy.partial}</p>
        )}
        {props.report.items.length === 0 ? (
          <p class="m-0 text-xs text-muted-foreground">{copy.empty}</p>
        ) : (
          <>
            <ul class="m-0 grid list-none gap-1 p-0">
              {props.report.items.map((item) => (
                <li key={`${item.kind}:${item.name}`}>
                  <ReviewRow
                    item={item}
                    profile={props.report.profile}
                    selected={item === selected.value}
                    onLocate={() => {
                      selected.value = item;
                      props.onLocate(item);
                    }}
                  />
                </li>
              ))}
            </ul>
            <p class="m-0 text-[11px] leading-4 text-muted-foreground">
              {copy.evidence}
            </p>
          </>
        )}
        <ul class="m-0 list-none space-y-1 p-0 text-[11px] text-muted-foreground">
          {props.report.datasets.map((dataset) => (
            <li key={dataset.id}>
              {dataset.name} · {dataset.snapshot_at.slice(0, 10)} ·{" "}
              <a
                href={dataset.license_url}
                class="underline"
                target="_blank"
                rel="noreferrer"
              >
                {dataset.attribution} · {dataset.license}
              </a>
            </li>
          ))}
        </ul>
      </section>
    );
  },
  { name: "ObjectReviewPanel", props: ["report", "onLocate", "onClose"] },
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
