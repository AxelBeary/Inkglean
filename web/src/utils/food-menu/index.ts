// ============================================
// 「今天吃什么」菜谱库（REQ-035 批 D / 2026-09-25 两波扩建为分片目录）
// 纯内容数据聚合——勿在此目录加业务逻辑；页面/随机逻辑在 FoodMenu.vue
//
// 四类 key：healthy 健康版 / diabetes 糖尿病版（低GI控糖）/ gout 痛风版（低嘌呤）/ takeout 外卖版
// 同一菜品多标签共用池子；菜名全局唯一（单测 food-menu.test.ts 防退色）。
// 2026-09-25 两波扩建：495 → 3695 条（13 分片，两波各 6 路采集 + 4 路交叉验证）
// 注意：本推荐仅供参考，具体饮食请遵医嘱（糖尿病/痛风版免责提示，页面展示）
// ============================================
import type { FoodDish } from './types'
import { BASE_DISHES } from './dishes-base'
import { HEALTHY_HOME_DISHES } from './dishes-healthy-home'
import { HEALTHY_FIT_DISHES } from './dishes-healthy-fit'
import { DIABETES_DISHES } from './dishes-diabetes'
import { GOUT_DISHES } from './dishes-gout'
import { TAKEOUT_CN_DISHES } from './dishes-takeout-cn'
import { TAKEOUT_INTL_DISHES } from './dishes-takeout-intl'
import { HEALTHY_REGION_DISHES } from './dishes-healthy-region'
import { HEALTHY_SPECIAL_DISHES } from './dishes-healthy-special'
import { DIABETES_SWEET_DISHES } from './dishes-diabetes-sweet'
import { GOUT_SOUP_DISHES } from './dishes-gout-soup'
import { TAKEOUT_LOCAL_DISHES } from './dishes-takeout-local'
import { TAKEOUT_INTL2_DISHES } from './dishes-takeout-intl2'

export type { FoodDish }
export { FOOD_CATEGORIES } from './types'

export const FOOD_MENU: FoodDish[] = [
  ...BASE_DISHES,
  ...HEALTHY_HOME_DISHES,
  ...HEALTHY_FIT_DISHES,
  ...DIABETES_DISHES,
  ...GOUT_DISHES,
  ...TAKEOUT_CN_DISHES,
  ...TAKEOUT_INTL_DISHES,
  ...HEALTHY_REGION_DISHES,
  ...HEALTHY_SPECIAL_DISHES,
  ...DIABETES_SWEET_DISHES,
  ...GOUT_SOUP_DISHES,
  ...TAKEOUT_LOCAL_DISHES,
  ...TAKEOUT_INTL2_DISHES,
]
