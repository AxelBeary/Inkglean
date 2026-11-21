type BreadcrumbLike = {
  category?: string
  type?: string
  data?: Record<string, unknown>
}

export function redactUrlBreadcrumb<T extends BreadcrumbLike>(breadcrumb: T): T {
  if (!breadcrumb.data) return breadcrumb
  const keys = breadcrumb.category === 'navigation' ? ['from', 'to']
    : breadcrumb.type === 'http' ? ['url'] : []
  if (!keys.length) return breadcrumb

  const data = { ...breadcrumb.data }
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string') data[key] = value.split(/[?#]/, 1)[0]
  }
  return { ...breadcrumb, data }
}
