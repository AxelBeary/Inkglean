import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
// 纸墨 token 注入层（825 波0）：shared 哑组件消费 --paper2/--ink/--hq 等 CSS 变量，
// 桌面宿主在此注入（值移植自 web/src/styles/artist-tokens.css 亮色作用域，出处见文件头）
import "./styles/paper-ink.css";

createApp(App).use(createPinia()).use(router).mount("#app");
