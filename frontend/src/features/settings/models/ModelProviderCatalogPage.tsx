import { useNavigation } from "@/app/navigation";
import { Input } from "@/components/ui/input";
import {
  displayForProvider,
  providerCategoryCopy,
} from "@/features/settings/models/provider-copy";
import { ProviderLogo } from "@/features/settings/models/ProviderLogo";
import {
  providerCatalog,
  type ProviderCategory,
} from "@/features/settings/models/providers";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { ChevronRight, Search } from "lucide-vue-next";
import { computed, defineComponent, shallowRef } from "vue";
const content = zhCN.modelConnections;
export const ModelProviderCatalogPage = defineComponent(
  (_props, { slots: _slots }) => {
    const navigate = useNavigation();
    const query = shallowRef(""),
      setQuery = refSetter(query);
    const category = shallowRef<ProviderCategory>("recommended"),
      setCategory = refSetter(category);
    const providers = computed(() => {
      const normalizedQuery = query.value.trim().toLocaleLowerCase();
      return providerCatalog.filter((provider) => {
        if (
          category.value === "recommended"
            ? !provider.recommended
            : provider.category !== category.value
        )
          return false;
        if (normalizedQuery === "") return true;
        const display = displayForProvider(provider);
        return [
          display.name,
          display.description,
          display.badge,
          provider.id,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      });
    });
    return () => {
      const _providers = providers.value;
      return (
        <SettingsPageWrapper>
          <SettingsPageHeader
            title={content.title}
            description={content.description}
            actions={null}
          />
          <div class="model-route-page">
            <div class="model-route-header">
              <button
                type="button"
                class="model-route-header__back"
                onClick={() => void navigate("/settings/models")}
              >
                {content.catalog.backToList}
              </button>
              <div>
                <h2>{content.catalog.title}</h2>
                <p>{content.catalog.description}</p>
              </div>
            </div>

            <div class="provider-catalog-toolbar">
              <label class="provider-catalog-search">
                <Search class="size-4" aria-hidden="true" />
                <Input
                  value={query.value}
                  placeholder={content.catalog.search}
                  aria-label={content.catalog.searchLabel}
                  onInput={(event) =>
                    setQuery((event.target as HTMLInputElement).value)
                  }
                />
              </label>
              <select
                aria-label={content.catalog.category}
                value={category.value}
                onChange={(event) =>
                  setCategory(
                    (event.target as HTMLInputElement)
                      .value as ProviderCategory,
                  )
                }
              >
                {Object.entries(providerCategoryCopy).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {_providers.length === 0 ? (
              <div class="model-empty model-empty--compact">
                {content.catalog.empty}
              </div>
            ) : (
              <div class="provider-list">
                {_providers.map((provider) => {
                  const display = displayForProvider(provider);
                  return (
                    <button
                      type="button"
                      key={provider.id}
                      class="provider-row"
                      onClick={() =>
                        void navigate(`/settings/models/new/${provider.id}`)
                      }
                    >
                      <ProviderLogo type={provider.providerType} compact />
                      <span class="provider-row__body">
                        <strong>{display.name}</strong>
                        <span>{display.description}</span>
                      </span>
                      <span class="model-badge">{display.badge}</span>
                      <ChevronRight
                        class="size-4 text-t-tertiary"
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SettingsPageWrapper>
      );
    };
  },
  {
    name: "ModelProviderCatalogPage",
    inheritAttrs: false,
    props: [],
  },
);
