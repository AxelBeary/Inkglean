# 前端性能排查模式（五号用）

## Element Plus el-image 卡顿三件套

画师端/客户端页面卡顿，若涉及图片列表，优先检查：

| 属性 | 作用 | 缺失后果 |
|------|------|----------|
| `lazy` | IntersectionObserver 懒加载，视口外不发请求 | 页面加载时所有图片同时请求原图 |
| `decoding="async"` | 异步解码，不阻塞主线程 | 大图解码阻塞滚动/交互 |
| CSS `object-fit: cover` + 固定宽高 | 限制渲染尺寸 | 浏览器按原图尺寸布局再缩放 |

**诊断方法**：读 .vue 源码，搜索 `el-image`，检查是否有 `lazy` 和 `decoding` 属性。这是静态分析，不需要启动应用。

**修复模板**（+2 行，零风险）：
```html
<el-image
  :src="item.imageUrl" fit="cover" class="thumb"
  lazy decoding="async"
/>
```

## 列表渲染性能

- 活跃订单 <50：全量 DOM 可接受，不需要虚拟滚动
- 活跃订单 >100：考虑虚拟滚动（vue-virtual-scroller）或分页
- 判断标准：DOM 节点数 > 500 且用户报告滚动卡顿 → 需要虚拟滚动

## 验证顺序纪律

1. **先在终端直接跑** eslint / vitest / build，拿到 exit code 证据
2. **再创建验证脚本**（如需）
3. 脚本被阻断时，已有证据仍然有效——不要重新跑，引用已有结果

> 教训：先建脚本再跑 = 脚本被阻断就没有证据。先跑再建 = 证据已在手。
