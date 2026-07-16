-- ============================================================
-- MIGRATION: Add image_url to inventory_movements table
-- Run this in your Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.inventory_movements
ADD COLUMN IF NOT EXISTS image_url TEXT;
