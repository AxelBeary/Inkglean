/** 纸签脉页签条目（SegTabs.vue 的 props 形状）。
 *  类型独立成文件：`<script setup>` 不许含 ES 导出，宿主又要能给自己的 computed 数组标类型。 */
export interface TabItem {
  value: string
  label: string
}
