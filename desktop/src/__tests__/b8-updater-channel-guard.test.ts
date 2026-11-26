// B8 / TB-B8DOC 防回退哨兵：U33 更新产物与 e03447c2 验签公钥注入链「代码侧已落地」的静态断言。
// 来源：PR #100（已 MERGE）落地了 createUpdaterArtifacts=v1Compatible + 构建期注入 + 四道失败闸。
// 本测试只读 conf/workflow 文本，不跑 tauri build（本机无 cargo/chromium），防的是后续误改把代码侧成果回退。
// 不新增 accept.ps1 门禁道数——只是 desktop 既有 npm test 里多一条哨兵用例。
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// 刻意用字符串 URL + fileURLToPath：happy-dom 把 URL 挂成全局，new URL(..., import.meta.url) 会按
// http://localhost 解析拿不到磁盘路径（沿用 schedule-list-reorder.test.ts 的既有口径）。
const here = dirname(fileURLToPath(import.meta.url))
const tauriConfPath = resolve(here, '../../src-tauri/tauri.conf.json')
const workflowPath = resolve(here, '../../../.github/workflows/desktop-release.yml')

const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'))
const workflow = readFileSync(workflowPath, 'utf8')

describe('B8 更新产物与验签注入链 · 代码侧防回退（PR #100 已落地，勿回退）', () => {
  it('U33：tauri.conf.json bundle.createUpdaterArtifacts 必须为 v1Compatible', () => {
    // 只有 v1Compatible 才产 *.nsis.zip / *.sig / latest.json（workflow :120 硬找 *.nsis.zip）
    expect(tauriConf.bundle.createUpdaterArtifacts).toBe('v1Compatible')
  })

  it('e03447c2：workflow 仍从 vars.DESKTOP_UPDATE_PUBKEY 构建期注入公钥', () => {
    expect(workflow).toContain('DESKTOP_UPDATE_PUBKEY: ${{ vars.DESKTOP_UPDATE_PUBKEY }}')
    expect(workflow).toContain('updater pubkey -> injected from vars.DESKTOP_UPDATE_PUBKEY')
  })

  it('e03447c2：验签公钥四道失败闸齐全（未配置/占位值/base64 非法/替换未命中）', () => {
    // ①未配置
    expect(workflow).toMatch(/if \(-not \$pub\).*DESKTOP_UPDATE_PUBKEY 未配置/)
    // ②仍是 8/25 占位串
    expect(workflow).toMatch(/\$pub -eq \$placeholder.*8\/25 占位公钥/)
    // ③非单行 base64
    expect(workflow).toMatch(/\$pub -notmatch '\^\[A-Za-z0-9\+\/=\]\+\$'.*不是合法单行 base64/)
    // ④conf 未命中占位串（替换未发生）
    expect(workflow).toMatch(/\$patched -eq \$text.*未命中占位 pubkey/)
  })

  it('U33：更新基址 DESKTOP_UPDATE_BASE 构建期注入与占位域失败闸仍在', () => {
    expect(workflow).toContain('DESKTOP_UPDATE_BASE: ${{ vars.DESKTOP_UPDATE_BASE }}')
    expect(workflow).toMatch(/DESKTOP_UPDATE_BASE 未配置/)
    expect(workflow).toMatch(/DESKTOP_UPDATE_BASE 仍是占位域名/)
  })
})
