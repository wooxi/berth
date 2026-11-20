import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useTheme } from '@/lib/theme'

/** Sonner 通知，跟随当前主题 */
export function Toaster(props: ToasterProps) {
  const { theme } = useTheme()
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: '!border-border !bg-popover !text-popover-foreground !shadow-lg',
        },
      }}
      {...props}
    />
  )
}
