-- ============================================================
-- MIGRATION: Add image_url to stock_receipts table
-- Run this in your Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.stock_receipts
ADD COLUMN IF NOT EXISTS image_url TEXT;
