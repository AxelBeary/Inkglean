/**
 * 分页魔数单源（P1 汇总波 C17）
 * ArtworkManage/GuestbookManage/OrderList/ManualOrder/GuestbookReviewCard 曾各自硬编码。
 */

/** 常规列表单页条数（画师端 UI 分页） */
export const UI_PAGE_SIZE = 20
/** 全量拉取的单页上限（订单列表/手动录单，后端分页上限 200） */
export const FETCH_ALL_PAGE_SIZE = 200
/** 留言全量拉取的单页上限（后端 F-2 clamp 1-100，与订单上限不同） */
export const GUESTBOOK_FETCH_ALL_PAGE_SIZE = 100
/** 订单列表 UI 默认单页数（50；与常规 20 不同，保持原行为） */
export const ORDER_LIST_UI_PAGE_SIZE = 50
