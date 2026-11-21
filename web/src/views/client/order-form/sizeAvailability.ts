import type { StyleSize } from './types'

/** 未设状态的旧档位与明确可约的档位均可选择。 */
export function hasAvailableSize(sizes?: readonly Pick<StyleSize, 'display_status'>[] | null): boolean {
  return sizes?.some(size => !size.display_status || size.display_status === 'available') ?? false
}
