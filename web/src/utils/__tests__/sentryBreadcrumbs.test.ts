import { describe, expect, it } from 'vitest'
import { redactUrlBreadcrumb } from '../sentryBreadcrumbs'

describe('redactUrlBreadcrumb', () => {
  it('strips query strings and fragments from navigation history entries', () => {
    const result = redactUrlBreadcrumb({
      category: 'navigation',
      data: {
        from: 'https://inkglean.test/artist/alice/track?no=A-1&token=secret#top',
        to: '/artist/alice/delivery/A-1?token=secret'
      }
    })

    expect(result.data).toEqual({
      from: 'https://inkglean.test/artist/alice/track',
      to: '/artist/alice/delivery/A-1'
    })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('Sentry 数据采集配置逐项关闭 PII，避免只关 urlQueryParams 反而全开', () => {
    // Sentry 语义：显式传 dataCollection 后，未列出的字段回落到 DEFAULTS（全 true）。
    // 这条用例直接解析 main.ts 里实际下发的配置，防止以后有人删项或只关一项造成静默扩采。
    const sources = import.meta.glob('../../main.ts', { query: '?raw', import: 'default', eager: true })
    const source = Object.values(sources)[0] as string
    const block = source.match(/dataCollection:\s*\{([\s\S]*?)\}/)
    expect(block, 'main.ts 应显式配置 dataCollection').not.toBeNull()
    const body = block![1]
    for (const field of ['userInfo', 'cookies', 'httpHeaders', 'httpBodies', 'urlQueryParams']) {
      expect(body).toContain(field + ':')
    }
    expect(body).not.toContain('userInfo: true')
    expect(body).not.toContain('cookies: true')
  })

  it('strips fetch and XHR query strings without changing other breadcrumbs', () => {
    for (const category of ['fetch', 'xhr']) {
      const url = category === 'fetch' ? '/api/orders/track?token=fixture' : '/uploads/deliverables/1/test.zip?sig=fixture'
      const request = { category, type: 'http', data: { method: 'GET', url, status_code: 200 } }
      expect(redactUrlBreadcrumb(request).data).toEqual({ method: 'GET', url: url.split('?')[0], status_code: 200 })
      expect(request.data.url).toBe(url)
    }
    const breadcrumb = { category: 'console', data: { url: 'ordinary-data' } }
    expect(redactUrlBreadcrumb(breadcrumb)).toBe(breadcrumb)
  })
})
