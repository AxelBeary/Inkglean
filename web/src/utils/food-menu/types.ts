// 「今天吃什么」数据类型与分类 key（唯一事实源 food-menu/）
export interface FoodDish {
  /** 中文菜名/品类名，全局唯一 */
  name: string
  /** 分类 key，至少一个 */
  tags: string[]
  /** 一句话点评（口语化，12~20 字，可含忌口提示） */
  note: string
}

/** 四类分类 key -> 中文名（页面展示用，顺序 = 展示顺序） */
export const FOOD_CATEGORIES = {
  healthy: '健康版',
  diabetes: '糖尿病版',
  gout: '痛风版',
  takeout: '外卖版',
}
