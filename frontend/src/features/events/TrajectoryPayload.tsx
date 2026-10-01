import { Copy } from "lucide-react";
import { toast } from "sonner";
import { zhCN } from "@/locales/zh-CN";
import css from "./TrajectoryInspector.module.css";
const content = zhCN.trajectory;
export function payloadText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
export function TrajectoryPayload({
  value,
  tree = false,
}: {
  value: unknown;
  tree?: boolean;
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(payloadText(value));
      toast.success(content.copied);
    } catch (error) {
      console.error("[trajectory] Copy failed", error);
      toast.error(content.copyFailed);
    }
  }
  return (
    <div className={css.payload}>
      <button
        type="button"
        className={css.copy}
        title={content.copy}
        aria-label={content.copy}
        onClick={() => void copy()}
      >
        <Copy size={12} />
      </button>
      {tree && value !== null && typeof value === "object" ? (
        <JsonNode value={value} depth={0} />
      ) : (
        <pre className={css.sourceBlockContent}>{payloadText(value)}</pre>
      )}
    </div>
  );
}
function JsonNode({
  value,
  depth,
  name,
}: {
  value: unknown;
  depth: number;
  name?: string;
}) {
  const label =
    name === undefined ? null : <span className={css.jsonKey}>{name}: </span>;
  if (value === null || typeof value !== "object")
    return (
      <div className={css.jsonLeaf}>
        {label}
        <span
          className={
            typeof value === "string" ? css.jsonString : css.jsonLiteral
          }
        >
          {JSON.stringify(value)}
        </span>
      </div>
    );
  const entries = Object.entries(value);
  const brackets = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0)
    return (
      <div>
        {label}
        {brackets.join("")}
      </div>
    );
  return (
    <details open={depth < 2} className={css.jsonNode}>
      <summary>
        {label}
        {brackets[0]}
        <span className={css.jsonCount}> {entries.length} </span>
        {brackets[1]}
      </summary>
      <div className={css.jsonChildren}>
        {entries.map(([key, item]) => (
          <JsonNode key={key} name={key} value={item} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}
