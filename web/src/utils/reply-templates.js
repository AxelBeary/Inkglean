// ============================================
// 「社恐轻松回复」话术库（REQ-035 工具集 #2 / 四号 2026-08-08）
// 纯内容数据，零逻辑——页面/复制逻辑是页面的事，勿在此文件加业务逻辑
//
// 分类 key（页面 tab 顺序 = 本文件顺序）：
//   remind   催款（礼貌但不卑微，给台阶不催命）
//   decline  拒单（理由充分，留后路）
//   delay    延期（主动交代，给新时间点）
//   negotiate 谈价（守住底线，换条件）
//   daily    日常沟通（改稿/回复/节假等常见场景）
//
// 原则（用户红线「质量优先不注水」）：真实可用、口语化、不官腔、
// 不堆砌客套话；每条都是画师敢直接发出去的话。
// b4-5: 每条含 textEn（英文界面显示；中文话术内容本身不改）
// ============================================

export const REPLY_CATEGORIES = [
  'remind',
  'decline',
  'delay',
  'negotiate',
  'daily'
]

export const REPLY_TEMPLATES = {
  remind: [
    { name: '先软后明', text: '您好~这张稿子咱们定的是今天交，我这边已经画完了，方便的话麻烦结一下尾款（¥XX），收到后我立刻发原图给您！', textEn: 'Hi~ this piece is due today as we agreed. I\'ve finished it — when convenient, please settle the final payment (¥XX), and I\'ll send the original file right away!' },
    { name: '定金后话术', text: '您好，这边看到定金还没到账，稿子已经排上日程了～方便的话今天内安排一下，我好按时开工（笔芯）', textEn: 'Hi, I noticed the deposit hasn\'t arrived yet — your slot is already scheduled. If possible, please arrange it today so I can start on time (thanks!)' },
    { name: '逾期不催命', text: '您好，不好意思打扰啦，就是提醒一下之前说好的尾款时间到啦。您方便的时候处理一下就行，不急的话跟我说个大概时间也可以～', textEn: 'Hi, sorry to bother you — just a gentle reminder that the final payment time we agreed on has passed. No rush; let me know roughly when you can handle it, that\'s totally fine~' },
    { name: '老客户版本', text: '老客户就不绕弯子啦，上次那张图的尾款还没付哦，有空转一下就好，收到马上给你发原图！', textEn: 'No need to beat around the bush — the final payment for the last piece hasn\'t come through yet. Whenever you get a chance, send it over and I\'ll deliver the original right away!' },
    { name: '补差额', text: '您好，这张图追加了背景人物，按之前说好的加价 ¥XX，还差 ¥XX 尾款没付，付完我把最终图发您～', textEn: 'Hi, this piece had an extra background figure added. As agreed, that\'s ¥XX extra, so ¥XX remains on the final payment. Once paid, I\'ll send you the finished file~' },
    { name: '超期后委婉', text: '您好，稿子完成后一般当天发原图，看到您这边尾款还没安排～如果您暂时不方便也没关系，跟我说一声，我先把图留着', textEn: 'Hi, I usually send originals on the day the piece is done. I see the final payment hasn\'t been arranged yet — no problem if it\'s inconvenient; just let me know and I\'ll hold the file for you.' }
  ],
  decline: [
    { name: '档期排满', text: '您好，很抱歉！我这边目前的档期已经排到下个月了，这单怕是接不了，怕耽误您时间。您可以看看其他画师，或者下个月再约我～', textEn: 'Hi, I\'m really sorry! My schedule is fully booked into next month, so I can\'t take this one without risking your time. Feel free to check other artists, or come back next month~' },
    { name: '超出能力', text: '您好，感谢信任！这个题材我平时画得少，怕做出来的效果达不到您预期，就不接了，免得耽误您。可以帮您留意合适的画师～', textEn: 'Hi, thanks for the trust! I don\'t draw this subject often, and I\'m afraid the result wouldn\'t meet your expectations, so I\'ll pass rather than waste your time. I can keep an eye out for a suitable artist~' },
    { name: '内容不接', text: '您好，抱歉这类题材我这边不接的哈，和我的画风不太搭，怕画出来您不满意。有其他想法欢迎再聊！', textEn: 'Hi, sorry — I don\'t take this kind of subject; it doesn\'t match my style, and I don\'t want you to be disappointed with the result. Happy to discuss other ideas anytime!' },
    { name: '推荐替代', text: '您好，这单我暂时接不了（档期/题材原因），不过我认识几个画风类似的画师，需要的话推荐给您～', textEn: 'Hi, I can\'t take this one right now (schedule/subject reasons), but I know a few artists with similar styles — happy to recommend them if you\'d like~' },
    { name: '不接急单', text: '您好，抱歉这单要得比较急，我这边按流程排期至少要 X 天，怕来不及只能先拒绝了，耽误您了！', textEn: 'Hi, sorry — this needs to be done quite urgently, and my queue allows at least X days. I can\'t make it in time, so I have to decline. Sorry about that!' },
    { name: '价格档位外', text: '您好，这个复杂度在我目前的价档之外，暂时不接了哈。您也可以看看低一档的规格，价格合适的话还能谈～', textEn: 'Hi, this complexity is above my current price tier, so I\'ll pass for now. You could also look at a lower-tier spec — if the price works, we can still talk~' }
  ],
  delay: [
    { name: '主动交代', text: '您好，跟您同步一下进度：这张图我预计会比原定晚 X 天，原因是【身体/家里/接单撞车】，不好意思！我会尽快画完，成品效果不会打折。', textEn: 'Hi, quick progress update: this piece will be about X days later than planned, because of [health/family/scheduling overlap]. Sorry! I\'ll finish as soon as I can, and the final quality won\'t suffer.' },
    { name: '给新时间点', text: '您好，抱歉要延期了！原定周日交，我这边推到周三，实在不好意思。如果您那边时间卡得紧，我可以先出一版草稿给您看方向，确定没问题再细化～', textEn: 'Hi, sorry about the delay! It was due Sunday, and I\'m pushing it to Wednesday. If your schedule is tight, I can send a rough draft first so you can check the direction, then refine once you\'re happy~' },
    { name: '只延一两天', text: '您好，稿子要晚一两天给您，最后打磨阶段我想把细节画到位，怕赶工效果差。多等这两天，成品您肯定满意！', textEn: 'Hi, the piece will be a day or two late — I want to get the final details right rather than rush it. That little extra time will be worth it, I promise!' },
    { name: '客户催问时', text: '您好，还在画哈！进度比预计慢了一点，是因为【改稿/细节加多】，预计 X 号给您，实在不好意思，画完第一时间发您！', textEn: 'Hi, still working on it! It\'s taking a bit longer than expected because of [revisions/extra details]. I estimate X date — really sorry, and I\'ll send it the moment it\'s done!' },
    { name: '延期道歉+补偿', text: '您好，实在抱歉这次延期了！为了表达歉意，这张图的【加急项/小增项】我给您免了，成图会多花点心思，希望您谅解～', textEn: 'Hi, I\'m truly sorry about the delay! As an apology, I\'ll waive the [rush/small add-on] for this piece and put extra care into the final image. I hope you can forgive the wait~' }
  ],
  negotiate: [
    { name: '守住底线', text: '您好，这个价格确实是我这边的最低价啦，再低我怕质量也保不住，对您也不好。规格上如果有可以简化（减背景/减人物）的地方，价格倒是可以再聊～', textEn: 'Hi, this really is my floor price — any lower and I can\'t guarantee the quality, which wouldn\'t be good for you either. If we can simplify the spec (fewer background elements/figures), I can be more flexible~' },
    { name: '砍价换规格', text: '您好，原价是 ¥XX。如果您预算在 ¥XX，我可以按【半身/不带背景/简化上色】的规格来，效果还是可以的，您看？', textEn: 'Hi, the original price is ¥XX. If your budget is around ¥XX, I can do it at the [half-body/no background/simplified coloring] spec — still looks good. What do you think?' },
    { name: '打包优惠', text: '您好，单张这个价确实不能再低了～不过如果您要 3 张以上，我可以给个小优惠，或者送一张简单小涂鸦，您看哪种合适？', textEn: 'Hi, I really can\'t go lower per piece~ But if you order 3+ pieces, I can offer a small discount, or throw in a simple sketch. Which works better for you?' },
    { name: '对比说明', text: '您好，价格对应的是我的【复杂度和工期】，之前给您看的例图就是这个价位的完整效果。如果您觉得超预算，我们可以把复杂度降一档试试～', textEn: 'Hi, the price reflects the [complexity and time] involved — the sample pieces I showed you are the full result at this tier. If it\'s over budget, we could try one tier lower~' },
    { name: '定金分期', text: '您好，价格这边确实谈不了太多，不过付款方式可以灵活一点：可以先付定金，稿子完成再付尾款，这样您压力也小一些～', textEn: 'Hi, I can\'t negotiate the price much, but payment can be flexible: pay a deposit first, then the remainder when the piece is done — that way the pressure is lighter on your side~' },
    { name: '婉拒不降', text: '您好，抱歉这个价我这边确实做不了，降到这个程度工期和质量都会受影响，反而不如不做。您再看看？', textEn: 'Hi, sorry — I really can\'t do it at that price. Going lower would hurt both the schedule and the quality, so it\'s better not to take it at all. You could look around a bit more?' }
  ],
  daily: [
    { name: '收到需求', text: '您好，需求收到啦！我确认一下：【人物/风格/尺寸/工期】这几项，没问题的话我就开工了～', textEn: 'Hi, request received! Let me confirm: [character/style/size/schedule] — if these are right, I\'ll start right away~' },
    { name: '改稿回应', text: '您好，修改意见收到！我整理了一下：这次主要改【眼睛/动作/背景】，改完发您确认哈～', textEn: 'Hi, revision notes received! Here\'s what I\'ll change this round: [eyes/pose/background]. I\'ll send the updated version for your confirmation~' },
    { name: '拒绝过度改稿', text: '您好，目前这已经是第 X 轮修改啦，包含在费用内的改稿次数快用完了。之后的修改需要按增项收费，您看要继续吗？', textEn: 'Hi, this is round X of revisions now, and the free revision rounds included in the price are almost used up. Further changes will be billed as add-ons — would you like to continue?' },
    { name: '节假自动回复', text: '您好！我这边节假日休息，消息可能回得慢。急稿的话请提前说明，我会尽量安排；普通稿子假期后统一处理，谢谢理解～', textEn: 'Hi! I\'m off during the holiday, so replies may be slow. For urgent work, please let me know in advance and I\'ll try my best; regular requests will be handled after the holiday. Thanks for understanding~' },
    { name: '要参考图', text: '您好，为了画得更准，方便的话发我 2-3 张参考图（想要的感觉/姿势/风格都可以）？参考越具体，成图越接近您想要的～', textEn: 'Hi, to draw it more accurately, could you send me 2-3 reference images (the feel/pose/style you want)? The more specific the references, the closer the final piece will be to what you have in mind~' },
    { name: '发成图话术', text: '您好，图好啦！原图已通过【邮箱/网盘】发您，记得查收～如果哪里不满意，一周内都可以提修改意见，合作愉快！', textEn: 'Hi, the piece is done! The original has been sent via [email/cloud drive] — please check. If anything needs adjusting, you can give revision feedback within a week. Thanks for commissioning!' }
  ]
}
