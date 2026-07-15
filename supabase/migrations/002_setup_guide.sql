-- ============================================================
-- STEP 1: สร้างตารางทั้งหมด
-- รันอันนี้ก่อนใน Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (ต้องสร้าง User ใน Auth ก่อน)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('super_admin', 'manager', 'cashier', 'stock_staff')),
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  color TEXT DEFAULT '#8B1A2C',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES categories(id),
  sku TEXT UNIQUE,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 5,
  country TEXT,
  region TEXT,
  brand TEXT,
  winery TEXT,
  grape TEXT,
  vintage TEXT,
  alcohol_percent NUMERIC(4,1),
  volume_ml INT DEFAULT 750,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_code TEXT UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  password TEXT,
  points INT NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  member_level TEXT NOT NULL DEFAULT 'bronze' CHECK (member_level IN ('bronze', 'silver', 'gold', 'platinum')),
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_no TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id),
  cashier_id UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded', 'hold')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_note TEXT,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  service_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'transfer', 'qr', 'card', 'mixed')),
  cash_received NUMERIC(12,2) DEFAULT 0,
  change_amount NUMERIC(12,2) DEFAULT 0,
  note TEXT,
  table_no TEXT,
  points_earned INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  unit_price NUMERIC(10,2) NOT NULL,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity INT NOT NULL DEFAULT 1,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'qr', 'card')),
  amount NUMERIC(12,2) NOT NULL,
  reference_no TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hold_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hold_no TEXT NOT NULL UNIQUE,
  cashier_id UUID REFERENCES profiles(id),
  customer_id UUID REFERENCES customers(id),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hold_sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hold_sale_id UUID NOT NULL REFERENCES hold_sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'adjust', 'refund')),
  quantity INT NOT NULL,
  quantity_before INT NOT NULL DEFAULT 0,
  quantity_after INT NOT NULL DEFAULT 0,
  reference_type TEXT CHECK (reference_type IN ('purchase', 'sale', 'manual', 'refund', 'adjustment')),
  reference_id UUID,
  note TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_no TEXT NOT NULL UNIQUE,
  supplier_name TEXT,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  received_by UUID REFERENCES profiles(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_receipt_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_receipt_id UUID NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INT NOT NULL,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- STEP 2: Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id);

-- ============================================================
-- STEP 3: Auto-update trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- STEP 4: Enable RLS
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hold_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE hold_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Profiles RLS
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid() OR get_my_role() = 'super_admin');
CREATE POLICY "profiles_delete" ON profiles FOR DELETE USING (get_my_role() = 'super_admin');

-- Products RLS
CREATE POLICY "products_select" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (get_my_role() IN ('super_admin', 'manager'));
CREATE POLICY "products_update" ON products FOR UPDATE USING (get_my_role() IN ('super_admin', 'manager', 'cashier'));
CREATE POLICY "products_delete" ON products FOR DELETE USING (get_my_role() = 'super_admin');

-- Categories RLS
CREATE POLICY "categories_select" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_write" ON categories FOR ALL USING (get_my_role() IN ('super_admin', 'manager'));

-- Customers RLS
CREATE POLICY "customers_select" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_insert" ON customers FOR INSERT WITH CHECK (get_my_role() IN ('super_admin', 'manager', 'cashier'));
CREATE POLICY "customers_update" ON customers FOR UPDATE USING (get_my_role() IN ('super_admin', 'manager'));

-- Sales RLS
CREATE POLICY "sales_select" ON sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_insert" ON sales FOR INSERT WITH CHECK (get_my_role() IN ('super_admin', 'manager', 'cashier'));
CREATE POLICY "sales_update" ON sales FOR UPDATE USING (get_my_role() IN ('super_admin', 'manager'));

-- Sale items RLS
CREATE POLICY "sale_items_all" ON sale_items FOR ALL TO authenticated USING (true);

-- Payments RLS
CREATE POLICY "payments_all" ON payments FOR ALL TO authenticated USING (true);

-- Hold sales RLS
CREATE POLICY "hold_sales_all" ON hold_sales FOR ALL TO authenticated USING (true);
CREATE POLICY "hold_sale_items_all" ON hold_sale_items FOR ALL TO authenticated USING (true);

-- Inventory RLS
CREATE POLICY "inventory_select" ON inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_insert" ON inventory_movements FOR INSERT WITH CHECK (get_my_role() IN ('super_admin', 'manager', 'stock_staff', 'cashier'));

-- Stock receipts RLS
CREATE POLICY "stock_receipts_all" ON stock_receipts FOR ALL USING (get_my_role() IN ('super_admin', 'manager', 'stock_staff'));
CREATE POLICY "stock_receipt_items_all" ON stock_receipt_items FOR ALL USING (get_my_role() IN ('super_admin', 'manager', 'stock_staff'));

-- Audit logs RLS
CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT USING (get_my_role() IN ('super_admin', 'manager'));
CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Settings RLS
CREATE POLICY "settings_select" ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_write" ON settings FOR ALL USING (get_my_role() = 'super_admin');

-- ============================================================
-- STEP 5: Seed Data (Categories + Settings)
-- ============================================================
INSERT INTO categories (name, description, icon, color, sort_order) VALUES
  ('Red Wine', 'ไวน์แดง', '🍷', '#8B1A2C', 1),
  ('White Wine', 'ไวน์ขาว', '🥂', '#D4AF37', 2),
  ('Rosé', 'ไวน์โรเซ่', '🌹', '#E8927C', 3),
  ('Sparkling', 'ไวน์สปาร์คกลิ้ง', '✨', '#C0C0C0', 4),
  ('Champagne', 'แชมเปญ', '🍾', '#FFD700', 5),
  ('Dessert Wine', 'ไวน์หวาน', '🍯', '#8B4513', 6)
ON CONFLICT (name) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('shop_name', 'The Wine Cellar', 'ชื่อร้าน'),
  ('shop_address', '123 ถนนสุขุมวิท กรุงเทพฯ', 'ที่อยู่ร้าน'),
  ('shop_phone', '02-000-0000', 'เบอร์โทรร้าน'),
  ('vat_enabled', 'true', 'เปิดใช้ VAT'),
  ('vat_rate', '7', 'อัตรา VAT (%)'),
  ('vat_included', 'true', 'ราคารวม VAT แล้ว'),
  ('receipt_prefix', 'WC', 'คำนำหน้าเลขใบเสร็จ'),
  ('return_policy_days', '7', 'จำนวนวันที่คืนสินค้าได้'),
  ('low_stock_alert', '5', 'แจ้งเตือนสต๊อกต่ำกว่า')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ✅ สำเร็จ! ตอนนี้ไปสร้าง User ใน Authentication > Users
-- แล้วค่อยรัน STEP 6 ด้านล่าง
-- ============================================================
