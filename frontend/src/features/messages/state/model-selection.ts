import type {
  ModelCatalogEntry,
  ModelConnection,
} from "@/features/settings/models/api";

export interface UsableModel {
  readonly connection: ModelConnection;
  readonly entry: ModelCatalogEntry;
}

export function usableModelsFrom(
  connections: readonly ModelConnection[],
): UsableModel[] {
  return connections.flatMap((connection) =>
    connection.enabled && connection.credential.status === "ready"
      ? connection.entries
          .filter(
            (entry) =>
              entry.enabled &&
              entry.revision === connection.revision &&
              entry.availability === "available" &&
              entry.checks.text.status === "passed" &&
              entry.checks.tools.status === "passed",
          )
          .map((entry) => ({ connection, entry }))
      : [],
  );
}
