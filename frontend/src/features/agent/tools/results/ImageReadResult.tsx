import { ToolResultPanel } from "@/features/agent/tools/ToolActivityParts";
import { AttachmentStrip } from "@/features/attachments/AttachmentStrip";
import type { Attachment } from "@/features/attachments/api";
import { zhCN } from "@/locales/zh-CN";

export function ImageReadResult({ value, text, images, sessionId, offloadedIds }: {
  readonly value: unknown;
  readonly text: string;
  readonly images: readonly Extract<Attachment, { readonly kind: "image" }>[];
  readonly sessionId: string;
  readonly offloadedIds?: ReadonlySet<string>;
}) {
  if (typeof value !== "object" || value === null || !("path" in value) || typeof value.path !== "string" || !value.path) throw new Error("Invalid image read result.");
  if (images.length === 0) throw new Error("Image read result has no image receipt.");
  const path = value.path;
  return <div className="min-w-0" data-read-image-path={path}>
    <ToolResultPanel label={path} copyText={text}>
      <div className="px-3 py-2">
        <AttachmentStrip sessionId={sessionId} attachments={images} offloadedIds={offloadedIds} />
        {images.map(image => <div key={image.id} className="text-xs leading-5 text-secondary-foreground">
          {zhCN.conversation.tools.imageMetadata(image.width, image.height, image.media_type.slice(6).toUpperCase(), image.bytes)}
          {(image.width !== image.original_width || image.height !== image.original_height) && <span className="ml-2 text-muted-foreground">{zhCN.conversation.tools.imageOriginal(image.original_width, image.original_height)}</span>}
        </div>)}
      </div>
    </ToolResultPanel>
  </div>;
}
