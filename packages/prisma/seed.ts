import { PrismaClient, RoleType, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // ==================== ROLES ====================
  console.log('Creating roles...');
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { type: RoleType.SUPER_ADMIN },
      update: {},
      create: {
        name: 'Super Admin',
        type: RoleType.SUPER_ADMIN,
        description: 'ผู้ดูแลระบบสูงสุด',
        isSystem: true,
      },
    }),
    prisma.role.upsert({
      where: { type: RoleType.OWNER },
      update: {},
      create: {
        name: 'Owner',
        type: RoleType.OWNER,
        description: 'เจ้าของร้าน',
        isSystem: true,
      },
    }),
    prisma.role.upsert({
      where: { type: RoleType.MANAGER },
      update: {},
      create: {
        name: 'Manager',
        type: RoleType.MANAGER,
        description: 'ผู้จัดการ',
        isSystem: true,
      },
    }),
    prisma.role.upsert({
      where: { type: RoleType.CASHIER },
      update: {},
      create: {
        name: 'Cashier',
        type: RoleType.CASHIER,
        description: 'แคชเชียร์',
        isSystem: true,
      },
    }),
    prisma.role.upsert({
      where: { type: RoleType.STOCK_STAFF },
      update: {},
      create: {
        name: 'Stock Staff',
        type: RoleType.STOCK_STAFF,
        description: 'พนักงานสต๊อก',
        isSystem: true,
      },
    }),
  ]);

  const [superAdminRole, , managerRole, cashierRole] = roles;

  // ==================== BRANCHES ====================
  console.log('Creating branches...');
  const mainBranch = await prisma.branch.upsert({
    where: { code: 'BR001' },
    update: {},
    create: {
      name: 'สาขาหลัก',
      code: 'BR001',
      address: '123 ถนนสุขุมวิท กรุงเทพมหานคร 10110',
      phone: '02-000-0000',
      isMain: true,
      isActive: true,
    },
  });

  await prisma.branch.upsert({
    where: { code: 'BR002' },
    update: {},
    create: {
      name: 'สาขา 2',
      code: 'BR002',
      address: '456 ถนนสีลม กรุงเทพมหานคร 10500',
      phone: '02-000-0001',
      isMain: false,
      isActive: true,
    },
  });

  // ==================== USERS ====================
  console.log('Creating users...');
  const hashedPassword = await argon2.hash('Admin@1234');

  await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      username: 'superadmin',
      email: 'superadmin@pos.local',
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      phone: '0800000000',
      status: UserStatus.ACTIVE,
      roleId: superAdminRole.id,
      branchId: mainBranch.id,
    },
  });

  const cashierPassword = await argon2.hash('Cashier@1234');
  await prisma.user.upsert({
    where: { username: 'cashier01' },
    update: {},
    create: {
      username: 'cashier01',
      email: 'cashier01@pos.local',
      password: cashierPassword,
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      phone: '0811111111',
      status: UserStatus.ACTIVE,
      roleId: cashierRole.id,
      branchId: mainBranch.id,
    },
  });

  await prisma.user.upsert({
    where: { username: 'manager01' },
    update: {},
    create: {
      username: 'manager01',
      email: 'manager01@pos.local',
      password: cashierPassword,
      firstName: 'สมหญิง',
      lastName: 'รักงาน',
      phone: '0822222222',
      status: UserStatus.ACTIVE,
      roleId: managerRole.id,
      branchId: mainBranch.id,
    },
  });

  // ==================== CATEGORIES ====================
  console.log('Creating categories...');
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'beverages' },
      update: {},
      create: { name: 'เครื่องดื่ม', slug: 'beverages', color: '#8b5cf6', sortOrder: 1 },
    }),
    prisma.category.upsert({
      where: { slug: 'food' },
      update: {},
      create: { name: 'อาหาร', slug: 'food', color: '#f59e0b', sortOrder: 2 },
    }),
    prisma.category.upsert({
      where: { slug: 'wine' },
      update: {},
      create: { name: 'ไวน์', slug: 'wine', color: '#dc2626', sortOrder: 3 },
    }),
    prisma.category.upsert({
      where: { slug: 'snacks' },
      update: {},
      create: { name: 'ขนมขบเคี้ยว', slug: 'snacks', color: '#059669', sortOrder: 4 },
    }),
    prisma.category.upsert({
      where: { slug: 'general' },
      update: {},
      create: { name: 'สินค้าทั่วไป', slug: 'general', color: '#0ea5e9', sortOrder: 5 },
    }),
  ]);

  // ==================== SUPPLIERS ====================
  console.log('Creating suppliers...');
  const supplier1 = await prisma.supplier.upsert({
    where: { code: 'SUP001' },
    update: {},
    create: {
      name: 'บริษัท เครื่องดื่มไทย จำกัด',
      code: 'SUP001',
      contactName: 'คุณประสิทธิ์',
      email: 'purchase@thaidrink.com',
      phone: '02-111-1111',
      address: 'กรุงเทพมหานคร',
      isActive: true,
    },
  });

  // ==================== PRODUCTS ====================
  console.log('Creating products...');
  const products = [
    {
      name: 'น้ำดื่มสิงห์ 600ml',
      slug: 'singha-water-600ml',
      sku: 'BEV-001',
      barcode: '8850006000012',
      categoryId: categories[0].id,
      supplierId: supplier1.id,
      price: 10,
      costPrice: 6,
      lowStockAlert: 20,
    },
    {
      name: 'เป๊ปซี่ 325ml',
      slug: 'pepsi-325ml',
      sku: 'BEV-002',
      barcode: '8850006000029',
      categoryId: categories[0].id,
      supplierId: supplier1.id,
      price: 20,
      costPrice: 12,
      lowStockAlert: 15,
    },
    {
      name: 'กาแฟเนสกาแฟ 3in1',
      slug: 'nescafe-3in1',
      sku: 'BEV-003',
      barcode: '8850006000036',
      categoryId: categories[0].id,
      supplierId: supplier1.id,
      price: 15,
      costPrice: 8,
      lowStockAlert: 10,
    },
    {
      name: 'ข้าวผัดกุ้ง',
      slug: 'shrimp-fried-rice',
      sku: 'FOOD-001',
      barcode: '8850006000043',
      categoryId: categories[1].id,
      price: 120,
      costPrice: 60,
      hasExpiry: true,
      lowStockAlert: 5,
    },
    {
      name: 'ผัดไทย',
      slug: 'pad-thai',
      sku: 'FOOD-002',
      barcode: '8850006000050',
      categoryId: categories[1].id,
      price: 100,
      costPrice: 50,
      hasExpiry: true,
      lowStockAlert: 5,
    },
    {
      name: 'ไวน์แดง Cabernet Sauvignon',
      slug: 'cabernet-sauvignon-red',
      sku: 'WINE-001',
      barcode: '8850006000067',
      categoryId: categories[2].id,
      price: 850,
      costPrice: 450,
      hasExpiry: true,
      lowStockAlert: 3,
    },
    {
      name: 'ไวน์ขาว Chardonnay',
      slug: 'chardonnay-white',
      sku: 'WINE-002',
      barcode: '8850006000074',
      categoryId: categories[2].id,
      price: 750,
      costPrice: 380,
      hasExpiry: true,
      lowStockAlert: 3,
    },
    {
      name: 'มันฝรั่งทอด Lay\'s',
      slug: 'lays-chips',
      sku: 'SNK-001',
      barcode: '8850006000081',
      categoryId: categories[3].id,
      price: 35,
      costPrice: 20,
      lowStockAlert: 10,
    },
    {
      name: 'ปากกา Pilot',
      slug: 'pilot-pen',
      sku: 'GEN-001',
      barcode: '8850006000098',
      categoryId: categories[4].id,
      price: 25,
      costPrice: 12,
      lowStockAlert: 20,
    },
    {
      name: 'สมุดบันทึก A5',
      slug: 'notebook-a5',
      sku: 'GEN-002',
      barcode: '8850006000104',
      categoryId: categories[4].id,
      price: 55,
      costPrice: 28,
      lowStockAlert: 10,
    },
  ];

  for (const product of products) {
    const created = await prisma.product.upsert({
      where: { sku: product.sku },
      update: {},
      create: {
        ...product,
        price: product.price,
        costPrice: product.costPrice,
        taxable: true,
        taxRate: 7,
        trackInventory: true,
        status: 'ACTIVE',
      },
    });

    // Create initial inventory
    await prisma.productInventory.upsert({
      where: { productId_branchId: { productId: created.id, branchId: mainBranch.id } },
      update: {},
      create: {
        productId: created.id,
        branchId: mainBranch.id,
        quantity: Math.floor(Math.random() * 100) + 20,
      },
    });
  }

  // ==================== CUSTOMERS ====================
  console.log('Creating sample customers...');
  await prisma.customer.upsert({
    where: { phone: '0891234567' },
    update: {},
    create: {
      firstName: 'สมศักดิ์',
      lastName: 'มีทรัพย์',
      phone: '0891234567',
      email: 'somsak@example.com',
      loyaltyPoints: 250,
      totalSpent: 5000,
      totalOrders: 25,
    },
  });

  await prisma.customer.upsert({
    where: { phone: '0812345678' },
    update: {},
    create: {
      firstName: 'วิภา',
      lastName: 'สุขสม',
      phone: '0812345678',
      email: 'wipa@example.com',
      loyaltyPoints: 120,
      totalSpent: 2400,
      totalOrders: 12,
    },
  });

  // ==================== SETTINGS ====================
  console.log('Creating system settings...');
  const settings = [
    { key: 'shop_name', value: 'ร้านค้า POS', group: 'general', description: 'ชื่อร้าน' },
    { key: 'shop_address', value: '123 ถนนสุขุมวิท กรุงเทพฯ', group: 'general', description: 'ที่อยู่ร้าน' },
    { key: 'shop_phone', value: '02-000-0000', group: 'general', description: 'เบอร์โทรร้าน' },
    { key: 'vat_enabled', value: 'true', group: 'tax', description: 'เปิดใช้ VAT' },
    { key: 'vat_rate', value: '7', group: 'tax', description: 'อัตรา VAT (%)' },
    { key: 'receipt_header', value: 'ยินดีต้อนรับ', group: 'receipt', description: 'หัวใบเสร็จ' },
    { key: 'receipt_footer', value: 'ขอบคุณที่ใช้บริการ', group: 'receipt', description: 'ท้ายใบเสร็จ' },
    { key: 'loyalty_rate', value: '10', group: 'loyalty', description: 'ทุก X บาท ได้ 1 แต้ม' },
    { key: 'currency', value: 'THB', group: 'general', description: 'สกุลเงิน' },
    { key: 'timezone', value: 'Asia/Bangkok', group: 'general', description: 'Timezone' },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('✅ Database seed completed!');
  console.log('');
  console.log('📋 Login credentials:');
  console.log('  Super Admin: superadmin / Admin@1234');
  console.log('  Manager:     manager01  / Cashier@1234');
  console.log('  Cashier:     cashier01  / Cashier@1234');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
