import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Input } from "@/components/ui/input";
import { SettingsPageHeader, SettingsPageWrapper } from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import { displayForProvider, providerCategoryCopy } from "./provider-copy";
import { ProviderLogo } from "./ProviderLogo";
import { providerCatalog, type ProviderCategory } from "./providers";

const content = zhCN.modelConnections;

export function ModelProviderCatalogPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProviderCategory>("recommended");
  const providers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return providerCatalog.filter((provider) => {
      if (category === "recommended" ? !provider.recommended : provider.category !== category) return false;
      if (normalizedQuery === "") return true;
      const display = displayForProvider(provider);
      return [display.name, display.description, display.badge, provider.id]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [category, query]);

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader title={content.title} description={content.description} actions={null} />
      <div className="model-route-page">
        <div className="model-route-header">
          <button type="button" className="model-route-header__back" onClick={() => void navigate("/settings/models")}>
            {content.catalog.backToList}
          </button>
          <div>
            <h2>{content.catalog.title}</h2>
            <p>{content.catalog.description}</p>
          </div>
        </div>

        <div className="provider-catalog-toolbar">
          <label className="provider-catalog-search">
            <Search className="size-4" aria-hidden="true" />
            <Input
              value={query}
              placeholder={content.catalog.search}
              aria-label={content.catalog.searchLabel}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label={content.catalog.category}
            value={category}
            onChange={(event) => setCategory(event.target.value as ProviderCategory)}
          >
            {Object.entries(providerCategoryCopy).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {providers.length === 0 ? (
          <div className="model-empty model-empty--compact">{content.catalog.empty}</div>
        ) : (
          <div className="provider-list">
            {providers.map((provider) => {
              const display = displayForProvider(provider);
              return (
                <button
                  type="button"
                  key={provider.id}
                  className="provider-row"
                  onClick={() => void navigate(`/settings/models/new/${provider.id}`)}
                >
                  <ProviderLogo type={provider.providerType} compact />
                  <span className="provider-row__body">
                    <strong>{display.name}</strong>
                    <span>{display.description}</span>
                  </span>
                  <span className="model-badge">{display.badge}</span>
                  <ChevronRight className="size-4 text-t-tertiary" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </SettingsPageWrapper>
  );
}
