import {
  uploadAttachments,
  type AttachmentUpload,
} from "@/features/attachments/api";
import {
  IMAGE_TYPES,
  prepareAttachment,
} from "@/features/attachments/prepare-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MapObjectReference } from "@/features/sessions/map-context";
import { objectReview as copy } from "@/locales/zh-CN/object-review";
import { Camera } from "lucide-vue-next";
import { useMutation } from "@tanstack/vue-query";
import { defineComponent, reactive, shallowRef } from "vue";
import {
  saveFieldObservation,
  type FieldObservation,
  type FieldObservationInput,
} from "./field-observations";

export const FieldObservationForm = defineComponent(
  (props: {
    readonly sessionId: string;
    readonly reference: MapObjectReference;
    readonly onSaved: (observation: FieldObservation) => void;
    readonly onCancel: () => void;
  }) => {
    const now = new Date();
    const localTime = shallowRef(
      new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16),
    );
    const note = shallowRef("");
    const files = shallowRef<File[]>([]);
    const warning = shallowRef<string | null>(null);
    const input = shallowRef<HTMLInputElement | null>(null);
    const pendingSave = shallowRef<{
      readonly request: FieldObservationInput;
      readonly uploads: readonly AttachmentUpload[];
    } | null>(null);
    const save = reactive(
      useMutation({
        mutationFn: async () => {
          if (pendingSave.value === null) {
            const uploads = await Promise.all(
              files.value.map(prepareAttachment),
            );
            pendingSave.value = {
              request: {
                id: crypto.randomUUID(),
                reference: props.reference,
                observed_at: new Date(localTime.value).toISOString(),
                note: note.value.trim(),
                photo_ids: uploads.map((photo) => photo.id),
              },
              uploads,
            };
          }
          const { request, uploads } = pendingSave.value;
          if (uploads.length > 0)
            await uploadAttachments(
              props.sessionId,
              uploads,
              new AbortController().signal,
            );
          return saveFieldObservation(props.sessionId, request);
        },
        onSuccess: props.onSaved,
      }),
    );

    return () => {
      const locked = save.isPending || pendingSave.value !== null;
      return (
        <form
          class="space-y-2 rounded-md border border-border p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (localTime.value && (note.value.trim() || files.value.length))
              save.mutate();
          }}
        >
          <label class="block space-y-1 text-xs">
            <span>{copy.observedAt}</span>
            <Input
              type="datetime-local"
              required
              value={localTime.value}
              disabled={locked}
              onInput={(event) => {
                localTime.value = (
                  event.currentTarget as HTMLInputElement
                ).value;
              }}
            />
          </label>
          <label class="block space-y-1 text-xs">
            <span>{copy.fieldNote}</span>
            <Textarea
              rows={2}
              maxlength={2000}
              value={note.value}
              disabled={locked}
              placeholder={copy.fieldPlaceholder}
              onInput={(event) => {
                note.value = (event.currentTarget as HTMLTextAreaElement).value;
              }}
            />
          </label>
          <input
            ref={input}
            type="file"
            class="hidden"
            multiple
            accept={[...IMAGE_TYPES].join(",")}
            onChange={(event) => {
              const element = event.currentTarget as HTMLInputElement;
              const selected = [...(element.files ?? [])];
              element.value = "";
              if (
                selected.length > 8 ||
                selected.some(
                  (file) =>
                    !IMAGE_TYPES.has(file.type) || file.size > 16 * 1024 * 1024,
                ) ||
                selected.reduce((bytes, file) => bytes + file.size, 0) >
                  32 * 1024 * 1024
              ) {
                warning.value = copy.photoLimit;
                return;
              }
              warning.value = null;
              files.value = selected;
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={locked}
            onClick={() => input.value?.click()}
          >
            <Camera />
            {copy.addPhotos}
          </Button>
          {files.value.map((file, index) => (
            <p
              key={index}
              class="m-0 truncate text-xs text-muted-foreground"
              title={file.name}
            >
              {file.name}
            </p>
          ))}
          {warning.value && (
            <p role="alert" class="m-0 text-xs text-destructive">
              {warning.value}
            </p>
          )}
          {save.isError && (
            <p role="alert" class="m-0 text-xs text-destructive">
              {save.error.message}
            </p>
          )}
          <div class="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={props.onCancel}
            >
              {copy.cancel}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                save.isPending ||
                !localTime.value ||
                (!note.value.trim() && !files.value.length)
              }
            >
              {save.isPending ? copy.saving : copy.save}
            </Button>
          </div>
        </form>
      );
    };
  },
  {
    name: "FieldObservationForm",
    props: ["sessionId", "reference", "onSaved", "onCancel"],
  },
);
