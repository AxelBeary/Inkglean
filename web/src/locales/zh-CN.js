export default {
  pref: { toLight: '切换到亮色模式', toDark: '切换到暗色模式' },
  common: {
    status: { open: '可约稿', full: '已排满', break: '休息中', unknown: '未知' },
    statusShort: { open: '可约', full: '排满', break: '休息' },
    priority: { high: '高', medium: '中', low: '低' },
    orderStatus: {
      pending: '待确认', confirmed: '已确认', wip: '制作中', revision: '修改中',
      done: '已完成', delivered: '已交付', cancelled: '已取消', unknown: '未知'
    },
    source: { self: '自助', manual: '手动', clientSelf: '客户自助', manualEntry: '手动录入' },
    custom: '自定义', none: '无',
    save: '保存', cancel: '取消', delete: '删除', edit: '编辑', download: '下载',
    confirm: '确认', detail: '详情', actions: '操作', remove: '移除', add: '添加',
    saved: '保存成功', deleted: '已删除', removed: '已移除',
    confirmDeleteTitle: '确认删除', uploadFailed: '上传失败',
    footer: 'Powered by 画师约稿平台'
  },
  disclaimer: {
    title: '平台职责说明',
    text: '本平台仅协助验证身份与连接双方，所有后续沟通、支付与交付均在外进行。平台不提供托管、仲裁服务，请自行承担风险。'
  },
  menu: {
    logo: '🎨 约稿后台', dashboard: '📊 仪表盘', queue: '📋 排期看板', orders: '📦 订单管理',
    manualOrder: '✍ 手动录单', tiers: '💰 价格管理', artworks: '🖼 作品管理',
    rules: '📜 须知编辑', settings: '⚙ 主页设置', logout: '🚪 退出登录'
  },
  landing: {
    title: '🎨 画师约稿平台', subtitle: '找到你喜欢的画师，开始约稿',
    noBio: '这位画师还没有写简介', weibo: '微博', bilibili: 'B站',
    enterHome: '进入主页 →', noArtists: '还没有画师入驻', loadFailed: '加载画师列表失败'
  },
  artistHome: {
    weibo: '🔗 我的微博', bilibili: '📺 我的B站', commission: '🎨 我要约稿', track: '📋 查询进度',
    priceList: '💰 价格表', artworks: '🖼 作品展示', rules: '📜 约稿须知',
    aboutDays: '⏱ 约 {n} 天', loadFailed: '画师不存在或加载失败',
    statusOpen: '✅ 可约稿', statusFull: '⏳ 已排满', statusBreak: '💤 休息中'
  },
  orderForm: {
    backHome: '返回主页', title: '我要约稿', tierLabel: '选择档位', tierPlaceholder: '请选择约稿类型',
    descLabel: '需求描述', descPlaceholder: '描述你想要的画面：角色特征、姿势、风格、背景等',
    refLabel: '参考图（可选，最多5张，每张≤10MB）', refExceed: '最多上传5张参考图',
    qqLabel: '你的QQ号', qqPlaceholder: '画师会通过QQ联系你',
    nameLabel: '昵称（可选）', namePlaceholder: '怎么称呼你',
    notifyLabel: '📩 排到我的时候通过QQ通知我', agreeLabel: '✋ 我已阅读并同意以上约稿须知',
    submit: '提交约稿', successTitle: '约稿提交成功！', orderNoIs: '你的订单号是：',
    addQqHint: '请添加画师QQ沟通细节，报上你的订单号即可', viewProgress: '查看进度',
    selectTier: '请选择档位', fillQq: '请填写QQ号',
    fileTooBig: '文件「{name}」超过10MB限制（{size}MB），请压缩后重新上传',
    typeWarning: '建议转换为 JPG 或 WebP 格式以获得更好的预览体验，但当前格式也可以正常上传。',
    loadFailed: '加载画师信息失败'
  },
  track: {
    backHome: '返回主页', title: '查询进度', inputPlaceholder: '如果不记得请留空', search: '查询',
    orderNo: '订单号', orderNoLabel: '订单号', qqLabel: '你的QQ号', qqPlaceholder: '下单时填写的QQ号',
    artist: '画师', type: '类型', status: '状态', position: '排队位置',
    positionText: '第 {pos} 位 / 共 {total} 位', orderTime: '下单时间',
    stepSubmitted: '已提交', stepConfirmed: '已确认', stepWip: '制作中', stepDone: '已完成', stepDelivered: '已交付',
    deliverables: '📦 交付文件', otherOrder: '查询其他订单', enterQq: '请输入QQ号',
    contactTitle: '不记得订单号？', contactDesc: '请联系管理员或画师，报上你的QQ号即可找回订单。',
    contactArtist: '画师QQ', contactAdmin: '管理员QQ', copyQq: '复制', copied: '已复制',
    noOrdersTitle: '未找到订单', noOrdersDesc: '该QQ号在本画师处没有订单记录，请核对QQ号是否正确。',
    noOrdersCountdown: '{n} 秒后可关闭'
  },
  delivery: {
    delivered: '作品已交付', notDelivered: '作品尚未交付',
    orderInfo: '订单号：{no} | 画师：{artist}', download: '⬇ 下载', noFiles: '暂无交付文件'
  },
  login: {
    title: '🎨 画师登录', subtitle: '输入你的QQ号，登录码将发送到你的QQ',
    qqPlaceholder: '输入你的QQ号', getCode: '获取登录码', codeSent: '登录码已发送至 QQ {qq}',
    codePlaceholder: '输入6位登录码', login: '登录', changeQq: '← 换个QQ号',
    devCode: '开发模式登录码: {code}', enterQq: '请输入QQ号', enterCode: '请输入登录码', loginSuccess: '登录成功！'
  },
  dashboard: {
    title: '📊 仪表盘', pendingNew: '待处理新单', activeOrders: '进行中订单',
    monthRevenue: '本月收入', totalCompleted: '累计完成', quickActions: '快捷操作',
    queueBoard: '📋 排期看板', manualOrder: '✍ 手动录单', allOrders: '📦 全部订单', settings: '⚙ 主页设置',
    currentStatus: '当前主页状态', statusUpdated: '状态已更新',
    statusOpen: '✅ 可约稿', statusFull: '⏳ 已排满', statusBreak: '💤 休息中'
  },
  queue: {
    title: '📋 排期看板',
    hint: '拖拽卡片调整顺序，顺序立即保存。优先级仅作标记，不影响排列顺序。',
    confirm: '✅ 确认', startWip: '🎨 开始制作', done: '✔ 完成', deliver: '📦 交付', cancel: '❌ 取消',
    empty: '队列空空，暂无订单', orderUpdated: '排序已更新',
    confirmCancel: '确定取消订单 #{no}？', confirmCancelTitle: '确认取消', statusUpdated: '状态已更新'
  },
  orderList: {
    title: '📦 订单管理', all: '全部',
    colOrderNo: '订单号', colType: '类型', colQq: '客户QQ', colName: '昵称',
    colPriority: '优先级', colStatus: '状态', colSource: '来源', colTime: '下单时间', colActions: '操作'
  },
  orderDetail: {
    backToQueue: '返回排期看板', backToList: '返回订单列表', orderNo: '订单 #',
    orderInfo: '订单信息', colOrderNo: '订单号', colType: '类型', colQq: '客户QQ', colName: '昵称',
    colPriority: '优先级', colSource: '来源', colTime: '下单时间', colDesc: '需求描述',
    statusFlow: '状态流转', confirmOrder: '✅ 确认接单', startWip: '🎨 开始制作',
    needRevision: '✏️ 需要修改', markDone: '✔ 标记完成', uploadDeliver: '📦 上传交付', cancelOrder: '❌ 取消订单',
    references: '参考图', notes: '备注记录', noNotes: '暂无备注', notePlaceholder: '添加备注...', addNote: '添加',
    deliverFiles: '交付文件', deliverTitle: '上传交付文件', dragUpload: '拖拽文件到此处，或点击上传',
    confirmDeliver: '确认交付', cancelConfirm: '确定取消此订单？', confirmTitle: '确认',
    statusUpdated: '状态已更新', priorityUpdated: '优先级已更新', noteAdded: '备注已添加', deliverSuccess: '交付成功！'
  },
  manualOrder: {
    title: '✍ 手动录单', hint: '客户通过QQ联系你后，在这里手动录入订单信息。',
    clientQq: '客户QQ号', clientQqPlaceholder: '客户的QQ号',
    clientName: '客户昵称（可选）', clientNamePlaceholder: '怎么称呼客户',
    tier: '档位', tierPlaceholder: '选择档位（可不选）',
    desc: '需求描述', descPlaceholder: '从QQ聊天中复制客户的需求描述',
    priority: '优先级', priorityHigh: '🔴 高', priorityMedium: '🟡 中（默认）', priorityLow: '🟢 低',
    submit: '录入订单', resultTitle: '录入成功', orderNo: '订单号: {no}', addedToQueue: '已加入排期队列',
    viewQueue: '查看排期', continueEntry: '继续录入', fillClientQq: '请填写客户QQ号'
  },
  tiers: {
    title: '💰 价格管理', addTier: '+ 添加档位',
    colExample: '例图', colName: '名称', colPrice: '价格', colDays: '工期', colDesc: '描述',
    editTitle: '编辑档位', addTitle: '添加档位', nameLabel: '名称',
    namePlaceholder: '如：头像、半身像、全身像', priceLabel: '价格（元）', daysLabel: '工期（天）',
    descLabel: '描述', descPlaceholder: '简要说明这个档位包含什么', exampleLabel: '例图（可选）',
    changeExample: '更换例图', uploadExample: '上传例图', removeExample: '移除',
    exampleUploaded: '例图已上传，点保存后生效', fillName: '请填写名称',
    confirmDelete: '确定删除档位「{name}」？', daysUnit: '{n}天'
  },
  artworks: {
    title: '🖼 作品管理', dragUpload: '拖拽图片到此处，或点击上传作品',
    tip: '支持 JPG / PNG / WebP，建议尺寸 ≥ 800px', empty: '还没有作品，上传一些吧',
    uploaded: '上传成功', confirmDelete: '确定删除这张作品？'
  },
  rules: {
    title: '📜 须知编辑', hint: '编辑客户下单前必须阅读的约稿须知。支持 HTML 标签。',
    placeholder: '输入约稿须知内容，支持 HTML 标签如 <h3>、<ul>、<li>、<strong> 等',
    preview: '预览：', save: '保存须知', saved: '须知已保存'
  },
  settings: {
    title: '⚙ 主页设置', nameLabel: '画师昵称', bioLabel: '个人简介', bioPlaceholder: '介绍一下自己',
    codeLabel: '身份码（订单号前缀）', codePlaceholder: '如 ALICE、QY（2-10位大写字母/数字）',
    codeHint: '身份码用于生成订单号前缀（如 ALICE-001），修改后新订单生效，已有订单号不变',
    statusLabel: '主页状态', statusOpen: '✅ 可约稿', statusFull: '⏳ 已排满', statusBreak: '💤 休息中',
    weiboLabel: '微博链接（可选）', bilibiliLabel: 'B站链接（可选）',
    contactQqLabel: '联系QQ（客户可见）', contactQqPlaceholder: '留空则默认使用登录QQ',
    contactQqHint: '客户不记得订单号时会看到此QQ，用于联系你找回订单',
    notifyLabel: '客户QQ通知', notifyText: '允许客户接收排队/完成通知',
    save: '保存设置', saved: '设置已保存'
  },
  admin: {
    backToAdmin: '返回后台', panelTitle: '管理员面板',
    artistCount: '画师数', totalOrders: '总订单', activeOrders: '活跃订单',
    artistList: '画师列表', manageArtists: '管理画师',
    colName: '昵称', colSubdomain: '子域名', colQq: 'QQ号', colStatus: '状态', colBio: '简介',
    backToPanel: '返回管理面板', artistManage: '画师管理', addArtist: '+ 添加画师',
    addTitle: '添加画师', qqLabel: 'QQ号', qqPlaceholder: '画师的QQ号（用于登录）',
    nameLabel: '昵称', namePlaceholder: '展示给客户的名字',
    subdomainLabel: '子域名', subdomainPlaceholder: '如 alice（小写字母/数字/连字符）',
    codeLabel: '身份码（可选）', codePlaceholder: '如 ALICE（默认用子域名大写）',
    bioLabel: '简介（可选）', domainSuffix: '.主域名',
    requiredFields: 'QQ号、昵称和子域名为必填项', added: '画师已添加',
    confirmRemove: '确定移除画师「{name}」？该画师的所有订单、作品数据将被永久删除！',
    confirmRemoveTitle: '⚠️ 危险操作', confirmRemoveBtn: '确定移除',
    artistOrders: '📦 订单记录', noOrders: '暂无订单', statusUpdated: '状态已更新',
    transferAdmin: '🔑 更换管理员', transferTitle: '更换管理员账号',
    transferStep1Title: '验证当前管理员', transferStep2Title: '验证新管理员',
    currentAdminQq: '当前管理员QQ', newAdminQq: '新管理员QQ',
    newAdminQqPlaceholder: '输入新管理员的QQ号（必须是已注册画师）',
    sendCode: '发送验证码', codeSent: '验证码已发送', enterCode: '输入6位验证码',
    nextStep: '下一步', confirmTransfer: '确认更换',
    transferSuccess: '管理员已更换为 {name}', adminTag: '管理员',
    orderColNo: '订单号', orderColQq: '客户QQ', orderColStatus: '状态',
    orderColType: '类型', orderColTime: '下单时间'
  }
}
