'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Heartbeat() {
  const supabase = createClient()

  useEffect(() => {
    let interval: NodeJS.Timeout

    const triggerHeartbeat = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Perform a silent update to trigger profiles_updated_at/updated_at timestamp update
          await supabase
            .from('profiles')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', user.id)
        }
      } catch (err) {
        console.error('Heartbeat failed:', err)
      }
    }

    // Trigger on mount
    triggerHeartbeat()

    // Trigger every 20 seconds
    interval = setInterval(triggerHeartbeat, 20000)

    return () => clearInterval(interval)
  }, [supabase])

  return null
}
