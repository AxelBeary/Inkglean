# SPEC-PRICE-2：价格模型统一重构（公式/数据模型唯一事实源）

> 编号：SPEC-PRICE-2
> 日期：2026-08-09
> 状态：用户已拍板（公式规则、旧数据处置、category 列均为用户原话确认）
> 取代：02H「价格三类合并」前端临时约定（名称约定分类、双轨倍率）全部作废
> 关联：REQ-036（增项交互）/ REQ-023（多画风）/ REQ-025（动态计价）

---

## 一、计价公式（铁律，全链路唯一口径）

```
最终价格 = (基础价 + 固定增项金额合计 + 百分比增项金额合计) × 用途倍率 × 加急倍率 × 折扣
```

规则（用户拍板，逐条不可违背）：

1. **固定增项金额合计**：多个固定金额增项分别计算后相加（数量型 = 单价 × 数量）。
2. **百分比增项金额合计**：多个百分比增项分别计算后相加。
3. **每个百分比增项金额 = 百分比 × 基础价**——只基于基础价，不基于"基础价+其他增项"后的小计。
4. **用途倍率、加急倍率**不参与增项内部计算；在小计（基础价+固定增项+百分比增项）形成后依次相乘：先用途，后加急，顺序不可颠倒。
5. **折扣**在用途、加急之后应用。
6. 整数分（cents）全程运算，防 IEEE 754：百分比存为整数 percent，`金额分 = round(基准分 × percent / 100)`，任何环节不出现 double 金额乘法。

与旧引擎（v49 style-pricing）差异：旧 multiply 项是 `小计 × Π(1+p%)` 连乘；新模型百分比增项是**基于基础价的加法金额**，语义彻底不同——迁移时必须换算，不可沿用。

## 二、增项数据模型（addon_templates，v50 迁移）

| 维度 | 取值 | 说明 |
|------|------|------|
| `control_type` | `switch`（开关类）/ `quantity`（个数类） | 仅此两类；radio 彻底退役（生产 0 条，禁止新建） |
| `price_mode` | `fixed`（+¥N）/ `percent`（+N%） | 两类控件都必须支持两种计价 |
| `category` | `add`（普通增项）/ `usage`（用途）/ `rush`（加急） | 新增列；取代名称约定分类 |
| `max_quantity` | 整数上限 | quantity 型防刷，创建后可编辑 |

语义矩阵：
- `category=add`：进「固定/百分比增项金额合计」（按 price_mode）；多选共存。
- `category=usage/rush`：用户可各配多个，**每单各只生效一个**（后端强制互斥校验，选中 >1 个 → 400）。生效值即公式中的用途/加急倍率（percent → 因子 `1 + p/100`）。
- 数量型 × 百分比：金额 = 基础价 × p% × 数量（自然扩展，文档注明）。

## 三、旧模型清退（用户拍板：全部测试数据，全删）

- `price_tiers` 表：DROP（迁移 v50 事务外执行，显式关 FK——v38 事故教训）。
- `price_multipliers` 表：DROP。
- `orders.usage_multiplier_id / rush_multiplier_id / tier_id` 列：随表重建移除（orders 表 10 条全为测试数据，迁移内清空，依赖表 order_payments / order_price_breakdown / order_payment_installments / order_references 级联清空）。
- 前端：MultiplierManager、倍率 tab、档位入口全部删除；旧倍率/档位 API 端点删除。
- 旧 `pricing.service.ts`（tier 计价）退役；`style-pricing.service.ts` 重写为唯一引擎。

## 四、一致性清单（同一公式的全部消费面）

| 面 | 文件 | 要求 |
|----|------|------|
| 计价引擎 | style-pricing.service.ts | 唯一计算源，整数分 |
| 价格预览（客户） | pricing.routes.ts calc-style | 直接调引擎 |
| 价格预览（画师） | AddonPreviewDialog.vue | 前端按同公式复算，或调 calc-style；展示每项贡献 |
| 下单提交 | order.service.ts createOrder | 引擎输出直写，不再自算 |
| 订单快照 | buildStyleQuoteSnapshot | 含基础价/各增项/用途/加急/折扣逐项 |
| 价格明细 | order_price_breakdown | item_type 覆盖 base/addon_fixed/addon_percent/usage/rush/discount |
| 分期收款 | pricing-engine.ts + order_payment_installments | 基数 = 折后总价（整数分），节点分摊尾差归末节点 |

## 五、验收标准

1. 引擎单元测试覆盖：纯基础价 / 固定增项 / 百分比增项（验证只基于基础价）/ 用途 / 加急 / 折扣 / 全组合；断言全部用整数分精确值。
2. 用途或加急传 ≥2 个选中 → 400。
3. radio 控件新建 → 400；price_mode/category 非法值 → 400。
4. 旧端点（/api/pricing/multipliers/*、tier 相关）→ 404/410。
5. 全链路回归：后端测试全绿、tsc 0、lint 0。

## 六、交互行为与防呆（批6 补充，2026-08-09）

1. **用途/加急控件约束**：category=usage/rush 的模板强制开关控件 + 百分比计价（创建/更新后端双拦）；新建弹窗选用途/加急时控件选择隐藏。
2. **新画风自动绑定**：createArtStyle 无条件绑定全部 usage/rush 模板（画师私有 + 系统预置），与 importAddons 无关；importAddons 仅控制普通增项导入。
3. **快照语义（v51）**：style_addons 的 tpl_* 快照列仅服务解绑行（addon_template_id IS NULL）；绑定行以模板为唯一权威，查询用 CASE WHEN 而非 COALESCE。
4. **多画风防呆**：关闭多画风时若启用画风 ≤1 个 → 拦截并提示；关闭成功后默认画风（首个启用）自动置顶。
5. **设为默认**：仅多画风关闭时可见；置顶并持久化 sort_order（默认 = 首个启用画风）。
6. **默认徽标**：仅多画风关闭时显示（开启时无默认概念，拖拽即调序）。
