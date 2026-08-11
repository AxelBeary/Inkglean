import type { CountRow, Migration } from './types.js'

export const migration: Migration = {
    version: 42,
    name: 'social_platforms',
    up(database) {
      // REQ-022 F2: 社交平台表（外链重做）
      // 纯 CREATE TABLE + 种子 INSERT，无 ALTER/DROP，事务内安全（对照 v40/v41）
      database.exec(`
        CREATE TABLE IF NOT EXISTS social_platforms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          icon_key TEXT,
          fallback_char TEXT,
          match_domains TEXT NOT NULL DEFAULT '[]',
          sort_order INTEGER DEFAULT 0,
          enabled INTEGER DEFAULT 1
        )
      `)
      // 种子数据（约 20 平台）：icon_key 采用 simple-icons slug（已对 master 分支逐一核验）；
      // simple-icons 无图标的平台（LOFTER/抖音/米画师/QQ空间）用 fallback_char 单字兜底。
      // 幂等守卫：仅当表为空时插入（复跑迁移不产生重复数据）。
      const count = (database.prepare('SELECT COUNT(*) AS c FROM social_platforms').get() as CountRow).c
      if (count === 0) {
        const insert = database.prepare(`
          INSERT INTO social_platforms (name, icon_key, fallback_char, match_domains, sort_order, enabled)
          VALUES (?, ?, ?, ?, ?, 1)
        `)
        const seeds: [string, string | null, string | null, string[], number][] = [
          ['微博', 'sinaweibo', null, ['weibo.com', 'weibo.cn'], 1],
          ['Bilibili', 'bilibili', null, ['bilibili.com', 'b23.tv'], 2],
          ['小红书', 'xiaohongshu', null, ['xiaohongshu.com', 'xhslink.com'], 3],
          ['LOFTER', null, 'L', ['lofter.com'], 4],
          ['Pixiv', 'pixiv', null, ['pixiv.net', 'pixiv.me'], 5],
          ['X (Twitter)', 'x', null, ['x.com', 'twitter.com'], 6],
          ['抖音', null, '抖', ['douyin.com'], 7],
          ['快手', 'kuaishou', null, ['kuaishou.com'], 8],
          ['豆瓣', 'douban', null, ['douban.com'], 9],
          ['QQ空间', null, '空', ['qzone.qq.com'], 10],
          ['YouTube', 'youtube', null, ['youtube.com', 'youtu.be'], 11],
          ['Instagram', 'instagram', null, ['instagram.com'], 12],
          ['Twitch', 'twitch', null, ['twitch.tv'], 13],
          ['ArtStation', 'artstation', null, ['artstation.com'], 14],
          ['米画师', null, '米', ['mihuashi.com'], 15],
          ['TikTok', 'tiktok', null, ['tiktok.com'], 16],
          ['DeviantArt', 'deviantart', null, ['deviantart.com'], 17],
          ['站酷', 'zcool', null, ['zcool.com.cn', 'zcool.cn'], 18],
          ['爱发电', 'afdian', null, ['afdian.com', 'afdian.net'], 19],
          ['Weasyl', 'weasyl', null, ['weasyl.com'], 20],
          ['Threads', 'threads', null, ['threads.net'], 21],
          ['Tumblr', 'tumblr', null, ['tumblr.com'], 22],
          ['Behance', 'behance', null, ['behance.net'], 23],
          ['网易云音乐', 'neteasecloudmusic', null, ['music.163.com'], 24]
        ]
        for (const [name, iconKey, fallbackChar, domains, sortOrder] of seeds) {
          insert.run(name, iconKey, fallbackChar, JSON.stringify(domains), sortOrder)
        }
      }
    }
  }
