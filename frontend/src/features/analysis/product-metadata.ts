export interface ProductReference {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly group: string;
  readonly file_path: string;
}
export interface ProductSummary {
  readonly valid_pixels: number;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly mean: number | null;
  readonly grid_pixel_area_m2?: number;
  readonly categories: readonly {
    value: number;
    label: string;
    color: string;
    pixel_count: number;
  }[];
}
export function productReferences(
  metadata: Readonly<Record<string, unknown>>,
): ProductReference[] {
  if (!Array.isArray(metadata.products)) return [];
  return metadata.products.filter(
    (p): p is ProductReference =>
      typeof p === "object" &&
      p !== null &&
      typeof p.id === "string" &&
      typeof p.title === "string" &&
      typeof p.group === "string" &&
      typeof p.name === "string" &&
      typeof p.file_path === "string",
  );
}
export function productSummary(
  metadata: Readonly<Record<string, unknown>>,
): ProductSummary | null {
  const p = metadata.summary;
  if (
    typeof p !== "object" ||
    p === null ||
    !("valid_pixels" in p) ||
    typeof p.valid_pixels !== "number" ||
    !("categories" in p) ||
    !Array.isArray(p.categories)
  )
    return null;
  return p as ProductSummary;
}
