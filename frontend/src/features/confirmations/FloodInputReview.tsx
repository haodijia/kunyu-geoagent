import { zhCN } from "@/locales/zh-CN";
import { defineComponent } from "vue";

const content = zhCN.conversation.confirmation.imagery;
const observations = [
  {
    label: content.before,
    keys: ["beforeCoverageID", "beforeSwirPath", "beforeSclPath"],
  },
  { label: content.after, keys: ["coverageID", "swirPath", "sclPath"] },
  { label: content.poi, keys: ["poiRasterPath"] },
];

export const FloodInputReview = defineComponent(
  (props: { readonly parameters: unknown }) => () => (
    <dl class="m-0 grid gap-3 text-xs leading-5">
      {observations.map(({ label, keys }) => (
        <div key={label} class="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)]">
          <dt class="font-medium text-muted-foreground">{label}</dt>
          <dd class="m-0 min-w-0">
            <ul class="m-0 list-none p-0 font-mono [overflow-wrap:anywhere]">
              {keys.map((key) => {
                const path =
                  typeof props.parameters === "object" &&
                  props.parameters !== null
                    ? Reflect.get(props.parameters, key)
                    : undefined;
                return (
                  <li key={key}>
                    {typeof path === "string" ? path : content.unspecified}
                  </li>
                );
              })}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  ),
  { name: "FloodInputReview", props: ["parameters"] },
);
