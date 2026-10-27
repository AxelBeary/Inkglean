import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
// 本地库模块的副作用：逐窗挂「关连接广播」监听（导入整库覆写前握手回执，#22-2）。
// 悬浮窗不一定经过 ledger store，故在入口显式引入，保证每个 webview 都挂得上。
import "./bridge/db";
// 纸墨 token 注入层（825 波0）：shared 哑组件消费 --paper2/--ink/--hq 等 CSS 变量，
// 桌面宿主在此注入（值移植自 web/src/styles/artist-tokens.css 亮色作用域，出处见文件头）
import "./styles/paper-ink.css";

createApp(App).use(createPinia()).use(router).mount("#app");
