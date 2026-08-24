<template>
  <PriceCardCore
    ref="coreRef"
    :t="t"
    :locale="localeText"
    :initial-draft="initialDraft"
    :artworks="artworks"
    :artworks-loading="artworksLoading"
    :importing="importing"
    @draft-change="onDraftChange"
    @copy-text="onCopyText"
    @notify="onNotify"
    @export-png="onExportPng"
    @request-artworks="onRequestArtworks"
    @request-import="onRequestImport"
  />
</template>

<script setup lang="ts">
// shared-824 路 B：约稿条改写为 @inkglean/shared 哑组件的薄宿主壳——
// 渲染/表单/画布全在共享组件内；宿主只保留宿主能力：
// i18n 注入（t/locale 直传）、草稿 localStorage 持久化（STORAGE_KEY 不变，老草稿兼容）、
// 剪贴板（公共 clipboard.copyText + 成败 toast）、ElMessage 提示、anchor 下载、
// 作品库取数（request-artworks）与真实档位导入（request-import：确认弹窗/取数/转换，
// 结果经共享组件 expose 的 applyImportedTiers 回灌）。
// 壳保持原路径原名（路由懒加载依赖），零样式（@container page 上下文由 ArtistLayout 提供）。
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { PriceCard as PriceCardCore } from '@inkglean/shared'
import type { PriceCardDraft, PriceCardArtwork, ImportedTier } from '@inkglean/shared'
import { safeGetItem, safeSetItem } from '../../utils/storage'
import { copyText as copyToClipboard } from '../../utils/clipboard'
import { artistApi, artistPublicApi } from '../../api/index'
import { useArtistStore } from '../../stores/artist'

const { t, locale } = useI18n()
const store = useArtistStore()

// locale 字符串化：生产 useI18n 返 ref（模板自动解包），测试桩为缺省/普通对象，统一取串后再传哑组件（prop 只收 string）
const localeText = computed(() => {
  const raw = locale as unknown as string | { value?: string } | undefined
  if (typeof raw === 'string') return raw
  return raw?.value ?? 'zh-CN'
})

const STORAGE_KEY = 'huiyue_price_card_draft'

// ─── 草稿持久化：挂载前读入（损坏 JSON 静默丢弃传 null），draft-change 回写 ───
function readDraft(): PriceCardDraft | null {
  const raw = safeGetItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const d = JSON.parse(raw)
    return d && typeof d === 'object' ? (d as PriceCardDraft) : null
  } catch {
    return null // 损坏 JSON 丢弃，按默认草稿继续
  }
}

const initialDraft = readDraft()

function onDraftChange(draft: PriceCardDraft) {
  safeSetItem(STORAGE_KEY, JSON.stringify(draft))
}

// ─── 复制：组件只产文本，剪贴板与成败提示归宿主 ───
async function onCopyText({ text }: { text: string }) {
  if (await copyToClipboard(text)) ElMessage.success(t('priceCard.copied'))
  else ElMessage.error(t('priceCard.copyFailed'))
}

// ─── 提示：text 已翻好，直接落 ElMessage ───
function onNotify({ kind, text }: { kind: 'success' | 'warning' | 'error' | 'info'; text: string }) {
  ElMessage[kind](text)
}

// ─── 导出：原 anchor 下载逻辑（URL.createObjectURL + a.click + revoke） ───
function onExportPng({ blob, filename }: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── 作品库例图：组件已自开弹窗，宿主只管取数并组好 src 直载地址回灌 ───
const coreRef = ref<InstanceType<typeof PriceCardCore> | null>(null)
const artworks = ref<PriceCardArtwork[] | null>(null)
const artworksLoading = ref(false)

async function onRequestArtworks() {
  // 原件口径：列表非空不重取（弹窗反复开关只取一次）
  if (artworks.value && artworks.value.length) return
  artworksLoading.value = true
  try {
    const arts = await artistApi.getArtworks()
    artworks.value = arts.map(art => ({
      id: art.id,
      title: art.title || art.image_path,
      src: '/uploads/' + art.image_path
    }))
  } catch {
    ElMessage.error(t('priceCard.pickFailed'))
  } finally {
    artworksLoading.value = false
  }
}

// ─── 一键导入真实档位：确认弹窗/取数/转换归宿主，回灌走共享组件 expose ───
const importing = ref(false)

async function onRequestImport({ hasContent }: { hasContent: boolean }) {
  if (importing.value) return
  // 原件口径：先查主页标识（缺失即警告返回），再弹覆盖确认，避免无效弹窗
  const subdomain = store.subdomain
  if (!subdomain) {
    ElMessage.warning(t('priceCard.importFailed'))
    return
  }
  // 已有填写内容 → 两步确认（覆盖不可逆）
  if (hasContent) {
    try {
      await ElMessageBox.confirm(t('priceCard.importConfirm'), t('priceCard.importConfirmTitle'), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      })
    } catch {
      return // 取消
    }
  }
  importing.value = true
  try {
    const res = await artistPublicApi.getPricing(subdomain)
    const tiers: ImportedTier[] = []
    for (const style of res.styles) {
      // showcase/hidden 尺寸不上公开价目（与客户端可见口径一致，只取 visible）
      for (const size of style.sizes.filter(s => s.display_status === 'visible')) {
        tiers.push({
          name: size.name.slice(0, 24),
          priceYuan: size.base_price,
          note: (size.description || '').slice(0, 40),
          group: style.name.slice(0, 24)
        })
      }
    }
    coreRef.value?.applyImportedTiers(tiers)
  } catch {
    ElMessage.error(t('priceCard.importFailed'))
  } finally {
    importing.value = false
  }
}
</script>
