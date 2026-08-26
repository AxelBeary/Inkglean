// 模块沙箱帧与桥协议（档②波17 四件）：规范 v0.3 §六硬契约的前端实现。
// 载体定案（拍板三）：跨源沙箱 iframe。实现形态＝data: URL 的 opaque origin iframe——
// 比 asset.localhost 更强的隔离：origin 完全不透明（连本地文件站点的同源身份都没有），
// 模块内容全部由壳内联注入（CSP + 握手脚本 + panel.js），物理上无任何可借道的同源资源。
// 硬契约六条落点：§六-1 opaque origin iframe / §六-2 帧内无 __TAURI__（不注入即无）/
// §六-3 帧级 CSP connect-src 'none' 物理断网 / §六-4 postMessage+握手口令（信封 {id,type,payload,token}）/
// §六-5 心跳保险丝（5s×3 杀帧置灰）/ §六-6 无 allow-same-origin → 无 localStorage/cookie。
export const MODULE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; " +
  "img-src data: blob:; style-src 'unsafe-inline'; worker-src 'none'; " +
  "base-uri 'none'; form-action 'none'; frame-src 'none'"

export interface Envelope {
  id: string
  type: string
  payload: unknown
  token: string
}

/** 信封校验（拍板三采纳）：形状 + token 一致才认；非法一律返 null（壳侧再记违规） */
export function verifyEnvelope(raw: unknown, token: string): Envelope | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const e = raw as Partial<Envelope>
  if (typeof e.id !== 'string' || typeof e.type !== 'string' || typeof e.token !== 'string') return null
  if (e.token !== token) return null
  return { id: e.id, type: e.type, payload: e.payload ?? null, token: e.token }
}

/** 握手令牌：每次装帧随机（模块无法伪造/复用旧帧令牌） */
export function newToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** 帧内握手脚本：收壳的握手拿 token，向 panel.js 暴露最小 API（window.shihui） */
function handshakeScript(): string {
  return [
    '(function(){',
    'var TOKEN=null;var listeners=[];',
    'window.addEventListener("message",function(e){',
    'var d=e.data;if(!d||typeof d!=="object")return;',
    'if(d.type==="shihui/handshake"&&d.payload&&typeof d.payload.token==="string"){TOKEN=d.payload.token;',
    'listeners.forEach(function(l){try{l({type:"shihui/ready-shell"})}catch(_){}});return}',
    'if(d.token!==TOKEN)return;',
    'listeners.forEach(function(l){try{l(d)}catch(_){}})',
    '});',
    'var seq=0;',
    'window.shihui={',
    'send:function(type,payload){if(!TOKEN)return null;var id="m"+(++seq);parent.postMessage({id:id,type:type,payload:payload==null?null:payload,token:TOKEN},"*");return id},',
    'ready:function(){this.send("shihui/ready")},',
    'heartbeat:function(){this.send("shihui/heartbeat")},',
    'on:function(type,cb){listeners.push(function(d){if(d.type===type)cb(d.payload,d)})},',
    'getData:function(view,cb){var id=this.send("shihui/view-data",{view:view});if(id)this.on("shihui/view-data:"+id,function(p){cb(p)})}',
    '};',
    'setInterval(function(){if(TOKEN)window.shihui.heartbeat()},5000);',
    '})();'
  ].join('\n')
}

/** 组装模块帧 HTML：CSP meta + 主题 token 注入 + 握手脚本 + 模块代码（全部内联，帧不加载任何外部资源）。
 *  主题 token 以值注入（装裱由壳统辖：模块可读 var(--paper) 等，但帧与壳不同源）。 */
export function buildModuleHtml(entryCode: string, themeCss = ''): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="${MODULE_CSP}">`
  const theme = themeCss ? `<style>:root{${themeCss}}</style>` : ''
  // 模块代码里的 </script> 需断开防提前闭合（不可信输入纪律）
  const safeCode = entryCode.split('</script>').join('<\\/script>')
  return `<!doctype html><html><head>${csp}${theme}</head><body style="margin:0">` +
    `<script>${handshakeScript()}</script>` +
    `<script>\ntry{\n${safeCode}\n}catch(e){window.shihui&&window.shihui.send("shihui/error",{message:String(e)})}\n</script>` +
    `</body></html>`
}

/** 帧 src：data URL（opaque origin，跨源隔离的物理形态） */
export function buildFrameSrc(entryCode: string, themeCss = ''): string {
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(buildModuleHtml(entryCode, themeCss))
}

/** 壳主题 token 采集：装裱由壳统辖的注入源（只读计算值，帧内只拿到值不拿到壳样式表） */
export function collectThemeCss(): string {
  const cs = getComputedStyle(document.documentElement)
  const keys = [
    '--paper', '--paper2', '--card', '--ink', '--ink2', '--ink3', '--ink4',
    '--line', '--line2', '--hq', '--hq-d', '--hq-t', '--hq-t2',
    '--zs', '--zs-d', '--zs-t', '--sl', '--sl-t', '--th', '--th-t', '--zhe', '--buf',
    '--f-d', '--f-b'
  ]
  return keys.map(k => `${k}:${cs.getPropertyValue(k).trim()}`).join(';')
}

// ─── 桥消息类型白名单（首发） ───
export const BRIDGE_TYPES = [
  'shihui/ready',        // 模块就绪上报（终止加载超时灰牌）
  'shihui/heartbeat',    // 心跳（5s 一拍，失联 3 次杀帧）
  'shihui/view-data',    // 请求声明过的只读视图数据
  'shihui/storage-read', // 私有存储读（write.own）
  'shihui/storage-write',// 私有存储写（配额 5MB，超拒记违规）
  'shihui/error'         // 模块自报错情（诊断用）
] as const

export type BridgeType = (typeof BRIDGE_TYPES)[number]

export function isBridgeType(t: string): t is BridgeType {
  return (BRIDGE_TYPES as readonly string[]).includes(t)
}
