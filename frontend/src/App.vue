<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watchEffect } from "vue";
import { useAppUiStore } from "@/app/store";
import { requestJson } from "@/api/client";
import { webContent as content } from "@/locales/zh-CN/web";
import { TooltipProvider } from "reka-ui";
import { Toaster } from "@/components/ui/sonner";
import { useQueryClient } from "@tanstack/vue-query";

const authenticated = ref(false),
  checking = ref(true),
  pending = ref(false);
const password = ref(""),
  error = ref<string | null>(null);
const ui = useAppUiStore();
const queryClient = useQueryClient();
const media = window.matchMedia("(prefers-color-scheme: dark)");
const systemDark = ref(media.matches);
const updateTheme = () => {
  systemDark.value = media.matches;
};
media.addEventListener("change", updateTheme);
watchEffect(() => {
  const theme =
    ui.themeMode === "system"
      ? systemDark.value
        ? "dark"
        : "light"
      : ui.themeMode;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
});
const expire = () => {
  authenticated.value = false;
  queryClient.clear();
  error.value = content.signedOut;
};
window.addEventListener("kunyu:unauthorized", expire);
onBeforeUnmount(() => {
  media.removeEventListener("change", updateTheme);
  window.removeEventListener("kunyu:unauthorized", expire);
});
onMounted(async () => {
  try {
    authenticated.value = (
      await requestJson<{ authenticated: boolean }>("/api/v1/auth/session")
    ).authenticated;
  } catch (reason) {
    console.error("[access] Instance session check failed.", reason);
    error.value = content.failed;
  } finally {
    checking.value = false;
  }
});
async function login() {
  if (pending.value) return;
  pending.value = true;
  error.value = null;
  try {
    authenticated.value = (
      await requestJson<{ authenticated: boolean }>("/api/v1/auth/session", {
        method: "POST",
        body: JSON.stringify({ password: password.value }),
      })
    ).authenticated;
    password.value = "";
  } catch (reason) {
    console.error("[access] Instance login failed.", reason);
    error.value = reason instanceof Error ? reason.message : content.failed;
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <TooltipProvider :delay-duration="300">
    <div
      v-if="checking"
      class="flex h-dvh items-center justify-center text-sm text-muted-foreground"
      role="status"
    >
      {{ content.checking }}
    </div>
    <RouterView v-else-if="authenticated" />
    <main
      v-else
      class="flex min-h-dvh items-center justify-center bg-background px-6"
    >
      <form
        class="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm"
        @submit.prevent="login"
      >
        <div class="space-y-2">
          <h1 class="text-2xl font-semibold tracking-tight">
            {{ content.title }}
          </h1>
          <p class="text-sm text-muted-foreground">{{ content.subtitle }}</p>
        </div>
        <label class="flex flex-col gap-2 text-sm">
          {{ content.password }}
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            :disabled="pending"
            class="h-10 rounded-md border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
        <p class="text-xs text-muted-foreground">{{ content.description }}</p>
        <p v-if="error" role="alert" class="text-sm text-destructive">
          {{ error }}
        </p>
        <button
          class="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
          :disabled="pending || !password"
        >
          {{ pending ? content.entering : content.enter }}
        </button>
      </form>
    </main>
    <Toaster />
  </TooltipProvider>
</template>
