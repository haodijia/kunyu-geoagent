import { ToolResultPanel } from "@/features/agent/tools/ToolActivityParts";
import { AttachmentStrip } from "@/features/attachments/AttachmentStrip";
import type { Attachment } from "@/features/attachments/api";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent } from "vue";
export const ImageReadResult = defineComponent(
  (
    componentProps: {
      readonly value: unknown;
      readonly text: string;
      readonly images: readonly Extract<
        Attachment,
        {
          readonly kind: "image";
        }
      >[];
      readonly sessionId: string;
      readonly offloadedIds?: ReadonlySet<string>;
    },
    { slots: _slots },
  ) => {
    const value = computed(() => componentProps.value),
      text = computed(() => componentProps.text),
      images = computed(() => componentProps.images),
      sessionId = computed(() => componentProps.sessionId),
      offloadedIds = computed(() => componentProps.offloadedIds);
    if (
      typeof value.value !== "object" ||
      value.value === null ||
      !("path" in value.value) ||
      typeof value.value.path !== "string" ||
      !value.value.path
    )
      throw new Error("Invalid image read result.");
    if (images.value.length === 0)
      throw new Error("Image read result has no image receipt.");
    const path = computed(() => {
      const source = value.value;
      if (
        typeof source !== "object" ||
        source === null ||
        !("path" in source) ||
        typeof source.path !== "string" ||
        !source.path
      )
        throw new Error("Invalid image read result.");
      return source.path;
    });
    return () => {
      const _path = path.value,
        _text = text.value,
        _sessionId = sessionId.value,
        _images = images.value,
        _offloadedIds = offloadedIds.value;
      return (
        <div class="min-w-0" data-read-image-path={_path}>
          <ToolResultPanel label={_path} copyText={_text}>
            <div class="px-3 py-2">
              <AttachmentStrip
                sessionId={_sessionId}
                attachments={_images}
                offloadedIds={_offloadedIds}
              />
              {_images.map((image) => (
                <div
                  key={image.id}
                  class="text-xs leading-5 text-secondary-foreground"
                >
                  {zhCN.conversation.tools.imageMetadata(
                    image.width,
                    image.height,
                    image.media_type.slice(6).toUpperCase(),
                    image.bytes,
                  )}
                  {(image.width !== image.original_width ||
                    image.height !== image.original_height) && (
                    <span class="ml-2 text-muted-foreground">
                      {zhCN.conversation.tools.imageOriginal(
                        image.original_width,
                        image.original_height,
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </ToolResultPanel>
        </div>
      );
    };
  },
  {
    name: "ImageReadResult",
    inheritAttrs: false,
    props: ["value", "text", "images", "sessionId", "offloadedIds"],
  },
);
