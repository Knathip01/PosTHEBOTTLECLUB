-- ============================================================
-- MIGRATION: Update Settings RLS & Seed Allowed Discounts
-- Run this script in your Supabase SQL Editor to allow managers
-- to modify store settings like active discount percentages.
-- ============================================================

-- 1. Drop existing settings write policy
DROP POLICY IF EXISTS "settings_write" ON public.settings;

-- 2. Create updated settings write policy that allows both super_admin and manager to manage settings
CREATE POLICY "settings_write" ON public.settings
  FOR ALL
  USING (get_my_role() IN ('super_admin', 'manager'));

-- 3. Seed default allowed discounts if they do not exist
INSERT INTO public.settings (key, value, description)
VALUES (
  'allowed_discounts',
  '[10, 20, 30, 40, 50, 60, 70, 80, 90]',
  'เปอร์เซ็นต์ส่วนลดมาตรฐานที่อนุญาตให้แคชเชียร์เลือกใช้หน้า POS'
)
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;
