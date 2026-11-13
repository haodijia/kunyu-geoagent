import { defineComponent, watchEffect } from "vue";
import { useRouter, type HistoryState } from "vue-router";
export function useNavigation() {
  const router = useRouter();
  return (
    path: string | number,
    options?: {
      replace?: boolean;
      state?: HistoryState;
    },
  ) => {
    if (typeof path === "number") {
      router.go(path);
      return Promise.resolve();
    }
    return options?.replace
      ? router.replace({
          path,
          state: options.state,
        })
      : router.push({
          path,
          state: options?.state,
        });
  };
}
export function matchRoute(pattern: string, pathname: string) {
  const keys: string[] = [];
  const parts = pattern.split("/").map((part) => {
    if (part === "*") return ".*";
    if (part.startsWith(":")) {
      keys.push(part.slice(1));
      return "([^/]+)";
    }
    return part;
  });
  const match = new RegExp("^" + parts.join("/") + "/?$").exec(pathname);
  return match
    ? {
        params: Object.fromEntries(
          keys.map((key, index) => [
            key,
            decodeURIComponent(match[index + 1]!),
          ]),
        ),
      }
    : null;
}
export const Navigate = defineComponent(
  (props: { to: string; replace?: boolean }) => {
    const navigate = useNavigation();
    watchEffect(() => {
      void navigate(props.to, {
        replace: props.replace,
      });
    });
    return () => null;
  },
  {
    props: ["to", "replace"],
  },
);
