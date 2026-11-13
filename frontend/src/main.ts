import App from "@/App.vue";
import { router } from "@/app/router";
import "@/styles.css";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp } from "vue";
createApp(App)
  .use(createPinia())
  .use(VueQueryPlugin, {
    queryClientConfig: {
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    },
  })
  .use(router)
  .mount("#root");
