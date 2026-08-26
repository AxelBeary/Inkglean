// 稿情气象台（拾绘官方示例模块）：把今日稿情画成一句天气。
// 模块契约样板：只用 window.shihui（壳桥最小 API）+ 主题 token（var(--*)），
// 不碰 localStorage/cookie（沙箱帧也没有）、不联网（CSP 物理断网）、不画设置 UI（壳统辖）。
(function () {
  var body = document.body
  body.style.cssText = 'margin:0;padding:12px 14px;background:var(--card);color:var(--ink2);font-family:var(--f-b)'

  var title = document.createElement('div')
  title.textContent = '稿情气象台'
  title.style.cssText = 'font-family:var(--f-d);font-weight:700;font-size:14px;color:var(--ink);margin-bottom:6px'
  body.appendChild(title)

  var line = document.createElement('div')
  line.style.cssText = 'font-size:13px;line-height:1.7'
  line.textContent = '正在观天象…'
  body.appendChild(line)

  function daysLeft(deadline) {
    if (!deadline) return null
    var d = new Date(deadline)
    if (isNaN(d.getTime())) return null
    var n = new Date()
    var a = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
    var b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    return Math.round((b - a) / 86400000)
  }

  function fmtSecs(s) {
    s = Math.max(0, Math.floor(s || 0))
    var h = Math.floor(s / 3600)
    var m = Math.floor((s % 3600) / 60)
    if (h > 0) return m > 0 ? h + ' 小时 ' + m + ' 分' : h + ' 小时'
    return m + ' 分'
  }

  function weatherOf(open, overdue, near) {
    if (overdue > 0) return { w: '⛈ 雷雨', s: overdue + ' 单逾期，宜先救火' }
    if (near > 0) return { w: '🌥 多云转雨', s: near + ' 单两日内截稿，宜收心' }
    if (open > 0) return { w: '☀ 晴', s: open + ' 单在案，宜从容' }
    return { w: '🌤 晴空', s: '今日无事，不如画画' }
  }

  // 视图数据只走桥（声明过 ledger/time 才给；壳侧防借道）
  window.shihui.getData('ledger', function (ledger) {
    ledger = Array.isArray(ledger) ? ledger : []
    window.shihui.getData('time', function (time) {
      var open = []
      for (var i = 0; i < ledger.length; i++) {
        var o = ledger[i]
        if (o.status === 'draft' || o.status === 'in_progress') open.push(o)
      }
      var overdue = 0
      var near = 0
      for (var j = 0; j < open.length; j++) {
        var dl = daysLeft(open[j].deadline)
        if (dl === null) continue
        if (dl < 0) overdue++
        else if (dl <= 2) near++
      }
      var wx = weatherOf(open.length, overdue, near)
      var painted = time && time.today && time.today.paint > 0 ? ' · 今天在画 ' + fmtSecs(time.today.paint) : ''
      line.textContent = '今日预报 · ' + wx.w + ' — ' + wx.s + painted
      // 数据就绪才报 ready（壳的 5 秒加载保险丝之内）
      window.shihui.ready()
    })
  })
})()
