import { Button } from "@/components/ui/button";
import { AttachmentStrip } from "@/features/attachments/AttachmentStrip";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import type { MapObjectReference } from "@/features/sessions/map-context";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { objectReview as copy } from "@/locales/zh-CN/object-review";
import { computed, defineComponent, shallowRef } from "vue";
import { FieldObservationForm } from "./FieldObservationForm";
import {
  fieldObservationsFor,
  type FieldObservation,
} from "./field-observations";

export const FieldObservationSection = defineComponent(
  (props: { readonly reference: MapObjectReference }) => {
    const session = useSessionWorkspace();
    const events = useSessionEvents();
    const adding = shallowRef(false);
    const expanded = shallowRef(false);
    const saved = shallowRef<FieldObservation | null>(null);
    const observations = computed(() => {
      const records = fieldObservationsFor(events.records, props.reference);
      const last = saved.value;
      return last && !records.some((record) => record.id === last.id)
        ? [last, ...records]
        : records;
    });

    return () => (
      <div class="space-y-2">
        <div class="flex flex-wrap gap-1 pt-1">
          {!session.archived && !adding.value && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                adding.value = true;
              }}
            >
              {copy.recordField}
            </Button>
          )}
          {observations.value.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-expanded={expanded.value}
              onClick={() => {
                expanded.value = !expanded.value;
              }}
            >
              {copy.observationCount(observations.value.length)}
            </Button>
          )}
        </div>
        {adding.value && (
          <FieldObservationForm
            sessionId={session.id}
            reference={props.reference}
            onCancel={() => {
              adding.value = false;
            }}
            onSaved={(value) => {
              saved.value = value;
              adding.value = false;
              expanded.value = true;
            }}
          />
        )}
        {expanded.value &&
          observations.value.map((record) => (
            <article
              key={record.id}
              class="space-y-1 border-t border-border pt-2"
            >
              <time datetime={record.observed_at} class="text-muted-foreground">
                {new Date(record.observed_at).toLocaleString("zh-CN", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </time>
              {record.note && (
                <p class="m-0 whitespace-pre-wrap break-words">{record.note}</p>
              )}
              <AttachmentStrip
                sessionId={session.id}
                attachments={record.photos}
              />
            </article>
          ))}
      </div>
    );
  },
  { name: "FieldObservationSection", props: ["reference"] },
);
