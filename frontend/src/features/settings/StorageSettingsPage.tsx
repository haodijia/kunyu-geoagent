import { requestJson } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { webContent } from "@/locales/zh-CN/web";
import { useQuery } from "@tanstack/vue-query";
import { defineComponent, reactive } from "vue";
type StorageStatus = {
  data_directory: string;
  free_bytes: number;
  total_bytes: number;
};
export const StorageSettingsPage = defineComponent(() => {
  const current = reactive(
    useQuery({
      queryKey: ["server", "storage"],
      queryFn: () => requestJson<StorageStatus>("/api/v1/storage"),
    }),
  );
  const content = webContent.storage;
  const size = (bytes: number) => (bytes / 1024 ** 3).toFixed(1) + " GiB";
  return () => (
    <SettingsPageWrapper>
      <SettingsPageHeader
        title={content.title}
        description={content.description}
        actions={null}
      />
      <div class="mt-8 space-y-4 text-sm">
        {current.isPending ? (
          <p role="status">{webContent.checking}</p>
        ) : current.isError ? (
          <p role="alert" class="text-destructive">
            {current.error.message}
            <Button onClick={() => void current.refetch()}>重试</Button>
          </p>
        ) : (
          <dl class="space-y-4">
            <div>
              <dt class="text-muted-foreground">{content.directory}</dt>
              <dd class="mt-1 break-all font-mono">
                {current.data.data_directory}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">
                {content.free} / {content.total}
              </dt>
              <dd class="mt-1">
                {size(current.data.free_bytes)} /{" "}
                {size(current.data.total_bytes)}
              </dd>
            </div>
          </dl>
        )}
        <p class="text-xs text-muted-foreground">{content.help}</p>
      </div>
    </SettingsPageWrapper>
  );
});
