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
