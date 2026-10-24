import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import {
  analysisApi,
  analysisKeys,
  type AnalysisOutput,
} from "@/features/analysis/api";
import { RasterOutputCard } from "@/features/analysis/RasterOutputCard";
import { productReferences } from "@/features/analysis/product-metadata";
import { productCopy as copy } from "@/locales/zh-CN/analysis-products";

export function BundleOutputCard(props: {
  readonly output: AnalysisOutput;
  readonly workspaceId: string;
  readonly sessionId: string | null;
  readonly compact?: boolean;
}) {
  const products = productReferences(props.output.metadata);
  const [selectedId, setSelectedId] = useState(props.output.id);
  const selected = useQuery({
    queryKey: analysisKeys.output(props.workspaceId, selectedId),
    queryFn: () => analysisApi.output(props.workspaceId, selectedId),
    enabled: selectedId !== props.output.id,
  });
  const current = selectedId === props.output.id ? props.output : selected.data;
  const selectedGroup = products.find((p) => p.id === selectedId)?.group;
  const groups = [...new Set(products.map((p) => p.group))];
  return (
    <div className="space-y-3" data-analysis-bundle={props.output.id}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Layers className="size-4 text-primary" />
        {copy.bundle}
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {copy.products(products.length)}
        </span>
      </div>
      <div
        className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1"
        role="group"
        aria-label={copy.groups}
      >
        {groups.map((group) => (
          <button
            type="button"
            key={group}
            aria-pressed={selectedGroup === group}
            className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${selectedGroup === group ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() =>
              setSelectedId(products.find((p) => p.group === group)!.id)
            }
          >
            {group}
          </button>
        ))}
      </div>
      <div
        className="flex flex-wrap gap-1"
        role="group"
        aria-label={copy.select}
      >
        {products
          .filter((p) => p.group === selectedGroup)
          .map((p) => (
            <button
              type="button"
              key={p.id}
              aria-pressed={p.id === selectedId}
              onClick={() => setSelectedId(p.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${p.id === selectedId ? "border-primary/30 bg-primary/8 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted"}`}
            >
              {p.title}
            </button>
          ))}
      </div>
      {current !== undefined ? (
        <RasterOutputCard {...props} output={current} key={current.id} />
      ) : (
        <p
          role={selected.isError ? "alert" : "status"}
          className="py-8 text-center text-xs text-muted-foreground"
        >
          {selected.isError ? selected.error.message : copy.loading}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">{copy.reuse}</p>
    </div>
  );
}
