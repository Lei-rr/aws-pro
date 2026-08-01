/**
 * App toast facade — same call sites as before:
 *   toast.success / error / warning / message / loading
 * Implementation: official vue-sonner (shadcn-vue sonner block).
 */
import { toast as sonner } from 'vue-sonner'

type Options = {
  description?: string
  duration?: number
  id?: string | number
}

function opts(options: Options = {}) {
  return {
    description: options.description,
    duration: options.duration ?? 3200,
    id: options.id,
  }
}

export const toast = {
  message: (title: string, description?: string) => sonner(title, opts({ description })),
  success: (title: string, description?: string) => sonner.success(title, opts({ description })),
  error: (title: string, description?: string) => sonner.error(title, opts({ description })),
  warning: (title: string, description?: string) => sonner.warning(title, opts({ description })),
  info: (title: string, description?: string) => sonner.info(title, opts({ description })),
  /** 进行中提示：默认不自动消失，需 dismiss(id) 或被 success/error 替换 */
  loading: (title: string, description?: string) => sonner.loading(title, opts({ description, duration: Infinity })),
  dismiss: (id?: string | number) => sonner.dismiss(id),
}
