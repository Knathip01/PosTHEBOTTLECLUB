import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user role to redirect appropriately
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'super_admin') {
    redirect('/login')
  } else if (profile?.role === 'stock_staff') {
    redirect('/stockstaff')
  } else if (profile?.role === 'cashier') {
    redirect('/pos')
  } else {
    redirect('/manager')
  }
}
