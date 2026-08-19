<template>
  <!-- ── 档位展示柜（旧模型）────────────────────────────── -->
  <div v-if="mode === 'tier' && tiers.length" class="tpl-tier-showcase">
    <div class="tpl-tier-menu">
      <button
        v-for="(item, idx) in menuItems"
        :key="item.key"
        class="tpl-tier-menu-item"
        :class="{
          'tpl-tier-menu-item--active': idx === activeIndex,
          'tpl-tier-menu-item--showcase': item.isShowcase
        }"
        @click="selectItem(idx)"
      >
        <span class="tpl-tier-menu-name">{{ item.name }}</span>
        <span class="tpl-tier-menu-price">{{ item.priceLabel }}</span>
        <span v-if="item.badge" class="tpl-tier-menu-badge">{{ item.badge }}</span>
      </button>
    </div>

    <div
      class="tpl-tier-display"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <template v-if="activeTier">
        <el-image
          v-if="activeTier.example_image"
          :src="imgUrl(activeTier.example_image)"
          fit="contain"
          class="tpl-tier-display-img"
          :alt="activeTier.name"
          :preview-src-list="[imgUrl(activeTier.example_image)]"
          preview-teleported
          hide-on-click-modal
        />
        <div v-else class="tpl-tier-display-empty">
          <p class="tpl-tier-display-desc">{{ activeTier.description || activeTier.name }}</p>
        </div>
        <div class="tpl-tier-display-info">
          <div class="tpl-tier-display-head">
            <h3 class="tpl-tier-display-name">{{ activeTier.name }}</h3>
            <span class="tpl-tier-display-price">{{ formatYuanValue(activeTier.price) }}</span>
          </div>
          <p v-if="activeTier.description" class="tpl-tier-display-desc">{{ activeTier.description }}</p>
          <p v-if="activeTier.work_days" class="tpl-tier-display-days">
            {{ $t('artistHome.aboutDays', { n: activeTier.work_days }) }}
          </p>
          <slot name="addons" :tier="activeTier"></slot>
          <button
            class="tpl-tier-select-btn"
            :disabled="activeTier.visibility === 'showcase' || artistStatus !== 'open'"
            @click="goOrder()"
          >
            {{ activeTier.visibility === 'showcase' ? $t('artistHome.tierShowcaseBtn') : $t('artistHome.tierSelectBtn') }}
          </button>
        </div>
      </template>
    </div>
  </div>

  <!-- ── 画风展示柜：多画风左菜单 + 右展示（新模型）────────── -->
  <div v-else-if="mode === 'style' && styles.length > 1" class="tpl-style-showcase">
    <div class="tpl-style-menu">
      <button
        v-for="(item, idx) in menuItems"
        :key="item.key"
        class="tpl-style-menu-item"
        :class="{ 'tpl-style-menu-item--active': idx === activeIndex }"
        @click="selectItem(idx)"
      >
        <span class="tpl-style-menu-name">{{ item.name }}</span>
        <span class="tpl-style-menu-price">{{ item.priceLabel }}</span>
      </button>
    </div>

    <div
      class="tpl-style-display"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <template v-if="activeStyle">
        <Transition name="tpl-style-img-fade" mode="out-in">
          <el-image
            v-if="displayImageUrl"
            :key="displayImageUrl"
            :src="displayImageUrl"
            fit="contain"
            class="tpl-style-display-img"
            :alt="activeStyle.name"
            :preview-src-list="[displayImageUrl]"
            preview-teleported
            hide-on-click-modal
          />
        </Transition>
        <div class="tpl-style-display-info">
          <div class="tpl-style-display-head">
            <h3 class="tpl-style-display-name">{{ activeStyle.name }}</h3>
          </div>
          <p v-if="displayDesc" class="tpl-style-display-desc">{{ displayDesc }}</p>
          <p v-if="displayWorkDays != null" class="tpl-style-display-days">
            {{ $t('artistHome.aboutDays', { n: displayWorkDays }) }}
          </p>
          <div class="tpl-style-sizes">
            <button
              v-for="sz in activeStyle.sizes" :key="sz.id"
              class="tpl-style-size-row"
              :class="{ 'tpl-style-size-row--active': sz.id === selectedSizeId }"
              @click="toggleSize(sz.id)"
            >
              <span class="tpl-style-size-name">{{ sz.name }}</span>
              <span class="tpl-style-size-price">{{ formatYuanValue(sz.base_price) }}</span>
              <span v-if="sz.id === selectedSizeId" class="tpl-style-size-check">✓</span>
            </button>
          </div>
          <button class="tpl-style-order-btn" :disabled="artistStatus !== 'open'" @click="goOrder()">
            {{ $t('artistHome.styleOrderBtn') }}
          </button>
          <p v-if="orderHint" class="tpl-style-order-hint">{{ orderHint }}</p>
        </div>
      </template>
    </div>
  </div>

  <!-- ── 单画风退化：纯尺寸列表（与 OrderForm 退化逻辑一致）── -->
  <div v-else-if="mode === 'style' && styles.length === 1" class="tpl-style-single">
    <div v-if="displayImageUrl" class="tpl-style-single-cover">
      <Transition name="tpl-style-img-fade" mode="out-in">
        <el-image
          :key="displayImageUrl"
          :src="displayImageUrl"
          fit="contain"
          class="tpl-style-single-img"
          :alt="singleStyle.name"
          :preview-src-list="[displayImageUrl]"
          preview-teleported
          hide-on-click-modal
        />
      </Transition>
    </div>
    <p v-if="displayDesc" class="tpl-style-single-desc">{{ displayDesc }}</p>
    <p v-if="displayWorkDays != null" class="tpl-style-single-days">
      {{ $t('artistHome.aboutDays', { n: displayWorkDays }) }}
    </p>
    <div class="tpl-style-sizes">
      <button
        v-for="sz in singleStyle.sizes" :key="sz.id"
        class="tpl-style-size-row"
        :class="{ 'tpl-style-size-row--active': sz.id === selectedSizeId }"
        @click="toggleSize(sz.id)"
      >
        <span class="tpl-style-size-name">{{ sz.name }}</span>
        <span class="tpl-style-size-price">{{ formatYuanValue(sz.base_price) }}</span>
        <span v-if="sz.id === selectedSizeId" class="tpl-style-size-check">✓</span>
      </button>
    </div>
    <button class="tpl-style-order-btn" :disabled="artistStatus !== 'open'" @click="goOrder()">
      {{ $t('artistHome.styleOrderBtn') }}
    </button>
    <p v-if="orderHint" class="tpl-style-order-hint tpl-style-order-hint--single">{{ orderHint }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PropType } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
// v0.35 联调：resolveSizeImagePath 尺寸图解析纯函数（artwork_image_path > image > 封面兜底由 displayImageUrl 处理）
import { useArtistData, resolveSizeImagePath } from '../../composables/useArtistData.js'
import { useTouchSwipe } from '../../composables/useTouchSwipe.js'
import { formatYuanValue } from '../../utils/money.js'

/** 档位（旧模型）宽松形状 */
interface TierLike {
  id: number
  name: string
  price: number
  description?: string | null
  work_days?: number | null
  example_image?: string | null
  visibility?: string | null
}

/** 画风尺寸宽松形状 */
interface StyleSizeLike {
  id: number
  name: string
  base_price: number
  description?: string | null
  work_days?: number | null
  display_status?: string | null
  artwork_image_path?: string | null
  image?: string | null
}

/** 画风宽松形状 */
interface StyleLike {
  id: number
  name: string
  description?: string | null
  cover_image?: string | null
  sizes?: StyleSizeLike[] | null
}

/** 统一左菜单条目（style/tier 形态适配） */
interface MenuItem {
  key: number
  name: string
  priceLabel: string
  badge: string
  isShowcase?: boolean
}

const props = defineProps({
  /** 展示形态：'style' = 画风柜（新模型）；'tier' = 档位柜（旧模型兜底） */
  mode: { type: String, default: 'style' },
  /** 画风列表（GET /api/public/styles/:subdomain，只含 is_active=1，按 sort_order 排序） */
  styles: { type: Array as PropType<StyleLike[]>, default: () => [] },
  /** 档位列表（旧模型，展示柜交互：桌面左菜单 / 移动端滑动） */
  tiers: { type: Array as PropType<TierLike[]>, default: () => [] },
  /** 画师子域名（跳转下单用） */
  subdomain: { type: String, default: '' },
  /** 画师信息（status 决定约稿按钮是否禁用） */
  artist: { type: Object as PropType<{ status?: string | null } | null>, default: null }
})

// 只取 imgUrl（不读 artist 数据，与 TplStatusBadge 同款传 null）
const { imgUrl } = useArtistData({ artist: null })
const router = useRouter()
const { t } = useI18n()

/** 画师接单状态：取不到时默认 open（不误伤可约稿画师） */
const artistStatus = computed(() => props.artist?.status ?? 'open')

const activeIndex = ref(0)
const activeTier = computed(() => props.tiers[activeIndex.value] || null)
const activeStyle = computed(() => props.styles[activeIndex.value] || null)
const singleStyle = computed(() => props.styles[0] || null)

/**
 * 数据适配器：style/tier 形态 → 统一左菜单条目
 * （名称 + 价格标签 + 可选徽标；展示区差异仍按 mode 分支保留）
 */
const menuItems = computed<MenuItem[]>(() => {
  if (props.mode === 'tier') {
    return props.tiers.map((tier) => ({
      key: tier.id,
      name: tier.name,
      priceLabel: formatYuanValue(tier.price),
      badge: tier.visibility === 'showcase' ? t('artistHome.tierShowcase') : '',
      isShowcase: tier.visibility === 'showcase'
    }))
  }
  return props.styles.map((style) => ({
    key: style.id,
    name: style.name,
    priceLabel: fromLabel(style),
    badge: ''
  }))
})

/** v0.34 任务B：当前展示柜已选尺寸（点选高亮，再点取消；切换画风/滑动切换时清空） */
const selectedSizeId = ref<number | null>(null)

/** v0.35 F3: 当前选中尺寸对象（多画风=activeStyle 下；单画风=singleStyle 下） */
const currentStyle = computed(() => (props.styles.length > 1 ? activeStyle.value : singleStyle.value))
const selectedSize = computed(() =>
  (currentStyle.value?.sizes || []).find(sz => sz.id === selectedSizeId.value) || null
)

/**
 * v0.35 F3: 大图 URL——选中尺寸有图→尺寸图（artwork_image_path 引用作品实时路径 > image 独立上传）；
 * 未选尺寸/尺寸无图→画风封面兜底，不留空白。
 */
const displayImageUrl = computed(() => {
  if (props.mode !== 'style') return ''
  const sizePath = resolveSizeImagePath(selectedSize.value)
  return imgUrl(sizePath || currentStyle.value?.cover_image || '')
})

/** v0.35 F3: 描述联动——选中带描述尺寸→尺寸描述；否则→画风描述 */
const displayDesc = computed(() => {
  if (props.mode !== 'style') return ''
  return selectedSize.value?.description || currentStyle.value?.description || ''
})

/** v0.35 F3: 工作天数联动——仅选中尺寸带天数时显示 */
const displayWorkDays = computed(() => (props.mode === 'style' ? (selectedSize.value?.work_days ?? null) : null))

/** 尺寸行点击：选中/取消选择（toggle）；展示态（showcase）尺寸不可选（与 OrderForm 后端拒单口径一致） */
function toggleSize(sizeId: number) {
  const size = (currentStyle.value?.sizes || []).find(sz => sz.id === sizeId)
  if (!size || size.display_status === 'showcase') return
  selectedSizeId.value = selectedSizeId.value === sizeId ? null : sizeId
}

/** v0.34 任务B：点击尺寸行后出现下单按钮提示，引导跳转预选 */
const orderHint = computed(() => {
  if (props.mode !== 'style' || selectedSizeId.value == null) return ''
  const list = (activeStyle.value?.sizes || [])
  const size = list.find(sz => sz.id === selectedSizeId.value)
  if (!size) return ''
  return t('artistHome.styleSizeHint', { size: size.name, price: size.base_price })
})

/** v0.34 任务B：切换画风（菜单/滑动）→ 清空尺寸选择（尺寸列表随画风变） */
function onStyleChange() {
  selectedSizeId.value = null
}

/** 菜单项选中：画风柜切换画风时清空尺寸选择（与滑动切换同口径，杜绝旧画风 sizeId 随 goOrder 下发） */
function selectItem(idx: number) {
  if (idx === activeIndex.value) return
  activeIndex.value = idx
  if (props.mode === 'style') onStyleChange()
}

/** 起步价标签（¥最低尺寸基础价起） */
function fromLabel(style: StyleLike) {
  const prices = (style.sizes || []).map(s => s.base_price)
  if (!prices.length) return '—'
  return formatYuanValue(Math.min(...prices)) + '+'
}

// 波 M：触摸滑动抽公共（阈值 50px，行为与旧 TplStyleGrid/TplTierGrid 一致）
const { onTouchStart, onTouchEnd: onSwipeEnd } = useTouchSwipe({ threshold: 50 })
function onTouchEnd(e: TouchEvent) {
  const dir = onSwipeEnd(e)
  const last = props.mode === 'tier' ? props.tiers.length - 1 : props.styles.length - 1
  if (dir === 'left' && activeIndex.value < last) {
    activeIndex.value++ // 左滑 → 下一个
    if (props.mode === 'style') onStyleChange()
  } else if (dir === 'right' && activeIndex.value > 0) {
    activeIndex.value-- // 右滑 → 上一个
    if (props.mode === 'style') onStyleChange()
  }
}

/** 跳转下单流程：style 带画风/尺寸 query（OrderForm 读 query 预选）；tier 保持原路径 */
function goOrder() {
  if (props.mode === 'style') {
    const query: Record<string, string | number> = {}
    const style = activeStyle.value || singleStyle.value
    if (style) query.styleId = style.id
    if (selectedSizeId.value != null) query.sizeId = selectedSizeId.value
    router.push({ path: `/artist/${props.subdomain}/order`, query })
    return
  }
  router.push(`/artist/${props.subdomain}/order`)
}
</script>

<style scoped>
/* ─── 展示柜共用骨架（旧 TplStyleGrid / TplTierGrid 合并，类名与视觉逐条保留） ─── */
.tpl-style-showcase,
.tpl-tier-showcase {
  display: flex;
  align-items: flex-start;
}
.tpl-style-showcase { gap: 16px; } /* v0.34 任务G：左菜单与右展示柜高度差过大时收紧 */
.tpl-tier-showcase { gap: 20px; }

/* 左侧菜单（画风/档位共用结构） */
.tpl-style-menu,
.tpl-tier-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  width: 180px;
}
.tpl-style-menu-item,
.tpl-tier-menu-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 1px solid var(--pal-border);
  border-radius: 10px;
  background: var(--pal-surface);
  cursor: pointer;
  transition: border-color var(--dur-mid) var(--ease-out), background-color var(--dur-mid) var(--ease-out), box-shadow var(--dur-mid) var(--ease-out);
  text-align: left;
  font-family: inherit;
}
.tpl-style-menu-item { padding: 10px 12px; } /* v0.34 任务G：菜单项收紧，减少左菜单下方空白感 */
.tpl-tier-menu-item { padding: 12px 14px; }
.tpl-style-menu-item:hover,
.tpl-tier-menu-item:hover {
  border-color: var(--color-primary);
}
.tpl-style-menu-item--active,
.tpl-tier-menu-item--active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--pal-surface));
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 15%, transparent);
}
.tpl-tier-menu-item--showcase {
  opacity: 0.55;
}
.tpl-tier-menu-item--showcase.tpl-tier-menu-item--active {
  opacity: 0.75;
}
.tpl-style-menu-name,
.tpl-tier-menu-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--pal-text);
  font-family: var(--font-display);
}
.tpl-style-menu-price,
.tpl-tier-menu-price {
  font-weight: 700;
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}
.tpl-style-menu-price { font-size: 14px; }
.tpl-tier-menu-price { font-size: 16px; }
.tpl-tier-menu-badge {
  font-size: 11px;
  color: var(--pal-text-dim);
  margin-top: 2px;
}

/* 右侧展示区 */
.tpl-style-display,
.tpl-tier-display {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--pal-border);
  border-radius: 12px;
  background: var(--pal-surface);
  overflow: hidden;
}
.tpl-style-display-img,
.tpl-tier-display-img {
  width: 100%;
  height: auto;
  display: block;
  cursor: zoom-in;
}
.tpl-tier-display-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 32px;
}
.tpl-style-display-info { padding: 18px 20px 22px; } /* v0.34 任务G：信息区收紧 */
.tpl-tier-display-info { padding: 20px 22px 24px; }
.tpl-style-display-head,
.tpl-tier-display-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.tpl-style-display-name,
.tpl-tier-display-name {
  font-size: clamp(16px, 2.5vw, 20px);
  font-weight: 600;
  font-family: var(--font-display);
  color: var(--pal-text);
  margin: 0;
}
.tpl-tier-display-price {
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 700;
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}
.tpl-style-display-desc,
.tpl-tier-display-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--pal-text-dim);
  margin: 0 0 8px;
}
.tpl-style-display-desc { margin-bottom: 12px; }
.tpl-style-display-days,
.tpl-tier-display-days {
  font-size: 12px;
  color: var(--pal-text-dim);
  margin: 0 0 12px;
}
.tpl-style-display-days { margin: -6px 0 12px; }
/* v0.35 F3: 大图切换淡入淡出（共享逻辑，各模板可覆盖时长） */
.tpl-style-img-fade-enter-active,
.tpl-style-img-fade-leave-active {
  /* T 波移交 M：0.18s → --dur-fast(.15s) 就近等值 */
  transition: opacity var(--dur-fast) var(--ease-out);
}
.tpl-style-img-fade-enter-from,
.tpl-style-img-fade-leave-to {
  opacity: 0;
}

/* 尺寸价格列表（多画风/单画风共用） */
.tpl-style-sizes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 4px;
}
/* v0.34 任务B：尺寸行可点击选择（button 元素，选中高亮复用菜单 active 语言） */
.tpl-style-size-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  width: 100%;
  border: 1px solid var(--pal-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-primary) 4%, var(--pal-surface));
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: border-color var(--dur-mid) var(--ease-out), background-color var(--dur-mid) var(--ease-out), box-shadow var(--dur-mid) var(--ease-out);
}
.tpl-style-size-row:hover {
  border-color: var(--color-primary);
}
.tpl-style-size-row--active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--pal-surface));
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 15%, transparent);
}
.tpl-style-size-check {
  color: var(--color-primary);
  font-weight: 700;
  font-size: 13px;
  margin-left: 8px;
}
.tpl-style-size-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--pal-text);
}
.tpl-style-size-price {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}

/* 下单按钮（画风柜 order / 档位柜 select 共用基底） */
.tpl-style-order-btn,
.tpl-tier-select-btn {
  display: inline-block;
  margin-top: 12px;
  padding: 10px 28px;
  border: none;
  border-radius: 8px;
  background: var(--color-primary);
  color: var(--pal-bg, #fff);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--dur-mid), transform var(--dur-fast);
  font-family: inherit;
}
.tpl-style-order-btn:hover:not(:disabled),
.tpl-tier-select-btn:hover:not(:disabled) {
  opacity: 0.88;
  /* T 波：hover 禁位移——保留透明度加深反馈 */
}
.tpl-style-order-btn:disabled,
.tpl-tier-select-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* v0.34 任务B：选中尺寸后的下单引导提示 */
.tpl-style-order-hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--pal-text-dim);
}
.tpl-style-order-hint--single {
  margin-left: 22px;
  margin-right: 22px;
}

/* ─── 单画风退化：纯尺寸列表（无"选画风"概念） ─── */
.tpl-style-single {
  border: 1px solid var(--pal-border);
  border-radius: 12px;
  background: var(--pal-surface);
  overflow: hidden;
  padding-bottom: 20px;
}
.tpl-style-single-img {
  width: 100%;
  height: auto;
  display: block;
  cursor: zoom-in;
}
.tpl-style-single-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--pal-text-dim);
  margin: 16px 22px 12px;
}
/* v0.35 F3: 单画风尺寸天数 */
.tpl-style-single-days {
  font-size: 12px;
  color: var(--pal-text-dim);
  margin: -6px 22px 12px;
}
.tpl-style-single .tpl-style-sizes {
  margin: 0 22px;
}
.tpl-style-single .tpl-style-order-btn {
  margin-left: 22px;
}

/* ─── 移动端：标签横排 + 展示区下方 + 滑动切换 ─── */
@media (max-width: 768px) {
  .tpl-style-showcase,
  .tpl-tier-showcase {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  .tpl-style-menu,
  .tpl-tier-menu {
    flex-direction: row;
    width: 100%;
    overflow-x: auto;
    gap: 8px;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
  }
  .tpl-style-menu-item,
  .tpl-tier-menu-item {
    flex-shrink: 0;
    min-width: 100px;
    padding: 8px 12px;
  }
  .tpl-style-display,
  .tpl-tier-display {
    /* 滑动区域 */
    touch-action: pan-y;
    width: 100%;
  }
}
</style>
