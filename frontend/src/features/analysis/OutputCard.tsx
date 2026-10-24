import type { AnalysisOutput } from "@/features/analysis/api";
import { BundleOutputCard } from "@/features/analysis/BundleOutputCard";
import { RasterOutputCard } from "@/features/analysis/RasterOutputCard";
import { productReferences } from "@/features/analysis/product-metadata";

export function OutputCard(props: {
  readonly output: AnalysisOutput;
  readonly workspaceId: string;
  readonly sessionId: string | null;
  readonly compact?: boolean;
}) {
  return productReferences(props.output.metadata).length > 0 ? (
    <BundleOutputCard {...props} key={props.output.id} />
  ) : (
    <RasterOutputCard {...props} />
  );
}
