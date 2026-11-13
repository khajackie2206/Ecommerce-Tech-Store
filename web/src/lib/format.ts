// Created once and reused: building an Intl formatter is relatively slow
const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

// 1990000 -> "1.990.000 ₫"
export function formatPrice(value: number): string {
  return vnd.format(value)
}
