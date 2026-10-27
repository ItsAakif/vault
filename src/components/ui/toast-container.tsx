'use client'

import { AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/store'
import { Toast } from './feedback-components'

export function ToastContainer() {
  const { notifications, removeNotification } = useUIStore()

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm">
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <Toast
            key={notification.id}
            title={notification.title}
            description={notification.description}
            type={notification.type}
            duration={notification.duration}
            action={notification.action}
            persistent={notification.persistent}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}