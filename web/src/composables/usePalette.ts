/**
 * usePalette — 画师主页配色设置
 *
 * 在 html 元素上设置 data-palette 属性（激活 --pal-* 变量），
 * 组件卸载时清理，避免离开主页后配色残留到后台页面。
 */
import { onMounted, onUnmounted, watch } from 'vue'
import type { Ref } from 'vue'

const VALID_PALETTES = ['paper', 'ink', 'dusk', 'moss']

export function usePalette(paletteIdRef?: Ref<string | null | undefined> | null) {
  const apply = (id: string | null | undefined) => {
    const palette = typeof id === 'string' && VALID_PALETTES.includes(id) ? id : 'paper'
    document.documentElement.dataset.palette = palette
  }

  onMounted(() => apply(paletteIdRef?.value))
  // paletteId 可能在 artist 数据加载后才有值，监听变化
  if (paletteIdRef) {
    watch(paletteIdRef, (id) => apply(id))
  }

  onUnmounted(() => {
    delete document.documentElement.dataset.palette
  })
}
