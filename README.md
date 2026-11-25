# ระบบบริหารพัสดุ (Asset Flow Management System)

ระบบเว็บสำหรับบริหารพัสดุและครุภัณฑ์ของหน่วยงาน ครอบคลุมตั้งแต่ทะเบียนครุภัณฑ์ วัสดุและสต็อก การจัดซื้อจัดจ้าง ไปจนถึงการเบิก จำหน่าย ซ่อมบำรุง และออกเอกสาร PDF

> **พัฒนาโดยคนเดียวทั้งระบบ** ตั้งแต่ออกแบบฐานข้อมูล เขียน Web API สร้างหน้าเว็บ เขียนเทสต์ ไปจนถึงตั้งค่า CI

<!-- TODO: ใส่ภาพหน้าจอ 3–4 ภาพที่นี่ (ซ่อนข้อมูลจริงของหน่วยงานก่อน) เช่น
![หน้าหลัก](docs/screenshots/home.png)
-->

## ระบบนี้ทำอะไรได้

| กลุ่มงาน | สิ่งที่ทำได้ |
|---|---|
| **ครุภัณฑ์** | ทะเบียนครุภัณฑ์และรายการย่อย ประวัติการใช้งาน การเบิก การซ่อมบำรุง และการจำหน่าย (แนบเอกสาร) |
| **วัสดุและสต็อก** | รับเข้า เบิกจ่าย ปรับยอด และบัตรคุมสต็อกของแต่ละรายการ |
| **จัดซื้อจัดจ้าง** | ทะเบียนการจัดซื้อ/จัดจ้าง โครงการ ผู้ขาย และประวัติสถานะของแต่ละรายการ |
| **เอกสาร PDF** | ออกใบเบิกวัสดุ/ครุภัณฑ์ และรายงานวัสดุคงเหลือรายปีงบประมาณ พร้อมแปลงจำนวนเงินเป็นตัวอักษรไทย |
| **ข้อมูลหลัก** | หน่วยงาน ตำแหน่ง ปีงบประมาณ แหล่งเงิน ประเภทค่าใช้จ่าย หมวดเงินทุน และอื่นๆ |
| **ผู้ใช้และสิทธิ์** | ล็อกอิน แยกสิทธิ์ตามบทบาท (ผู้ดูแลระบบ) จัดการบุคลากร |
| **หน้าสาธารณะ** | หน้า Public Portal ให้ดูสรุปการจัดซื้อรายบุคคล/โครงการ โดยไม่ต้องล็อกอิน |

## เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
|---|---|
| **Backend** | ASP.NET Core Web API (.NET 9), Entity Framework Core 9, SQL Server, ASP.NET Core Identity, AutoMapper, QuestPDF, Swagger |
| **Frontend** | Angular 21, TypeScript 5.9, Angular Material, Tailwind CSS 4 |
| **ทดสอบ** | xUnit |
| **CI** | GitHub Actions (รันเทสต์กับ SQL Server จริงใน container) |

## จุดเด่นทางเทคนิค

- **แยก backend / client ชัดเจน** เป็นสองโฟลเดอร์ในรีโปเดียว
- **สถาปัตยกรรมแบบแยกชั้น** `Core` (Entity และ Interface) → `Infrastructure` (EF Core, Repository, Migrations) → `APi` (Controller, DTO) ใช้ Generic Repository, Unit of Work และ Specification Pattern
- **ฐานข้อมูลที่ดูแลด้วย Migration** กว่า 30 Entity และกว่า 60 Migration ตลอดการพัฒนา
- **มีเทสต์อัตโนมัติ** ครอบคลุมระบบสต็อกวัสดุ การออกใบเบิก PDF และตัวแปลงจำนวนเงินเป็นตัวอักษรไทย พร้อม CI ที่รันเมื่อ push หรือเปิด Pull Request ที่แก้โค้ด backend
- **จัดการความลับอย่างปลอดภัย** บัญชีผู้ดูแลระบบเริ่มต้นไม่ถูกฝังในโค้ด อ่านจาก config / user-secrets
- **รองรับภาษาไทย** ทั้งเอกสาร PDF (ฟอนต์ TH Sarabun New) และการแปลงตัวเลขเป็นข้อความภาษาไทย

## โครงสร้างโปรเจกต์

```
AssetFlowManagementSystem/
├── backend/
│   ├── APi/              Web API (Controllers, DTOs, รายงาน PDF)
│   ├── Core/             Entities และ Interfaces
│   ├── Infrastructure/   EF Core, Repository, Migrations, Seed
│   └── APi.Tests/        xUnit tests
├── client/               Angular application
└── .github/workflows/    CI
```

## วิธีรันบนเครื่อง

**สิ่งที่ต้องมี:** .NET 9 SDK, Node.js (npm 11), SQL Server (หรือ SQL Server Express / LocalDB)

### 1) Backend

```powershell
cd backend\APi

# ตั้ง connection string ของเครื่องคุณ
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Server=.\SQLEXPRESS;Database=AssetFlow;TrustServerCertificate=True;Trusted_Connection=True;"

# (ไม่บังคับ) สร้างบัญชีผู้ดูแลระบบตอนเริ่มระบบครั้งแรก
dotnet user-secrets set "SeedAdmins:0:Email" "admin@example.com"
dotnet user-secrets set "SeedAdmins:0:Password" "ตั้งรหัสผ่านของคุณเอง"

dotnet run
```

ระบบจะสร้างและอัปเดตฐานข้อมูลให้อัตโนมัติตอนเริ่มทำงาน API อยู่ที่ `https://localhost:5000` และมี Swagger ให้ลองเรียก

### 2) Client

```powershell
cd client
npm install
```

ตัว dev server ใช้ HTTPS จึงต้องสร้างใบรับรองสำหรับ localhost ไว้ที่ `client/ssl/` ก่อน (เช่นด้วย [mkcert](https://github.com/FiloSottile/mkcert)):

```powershell
mkdir ssl
mkcert -install
mkcert -key-file ssl/localhost-key.pem -cert-file ssl/localhost.pem localhost
```

จากนั้นแก้ `client/src/environments/environment.development.ts` ให้ `baseUrl` ชี้ไปที่ API (มีบรรทัดตัวอย่าง `https://localhost:5000/api/` คอมเมนต์ไว้) แล้วรัน:

```powershell
npm start
```

เปิด `https://localhost:4200`

### 3) รันเทสต์

```powershell
cd backend
dotnet test APi.Tests
```

เทสต์ของระบบสต็อกวัสดุต้องใช้ SQL Server (LocalDB บน Windows หรือกำหนดผ่านตัวแปร `TEST_SQL_SERVER`)

## ผู้พัฒนา

**ภาคภูมิ จันทร์ทึก** · นักพัฒนาเว็บแอปพลิเคชัน

- GitHub: [github.com/pakphumjantuek](https://github.com/pakphumjantuek)
- อีเมล: _(ใส่อีเมลที่ต้องการให้ติดต่อ)_

> โปรเจกต์นี้พัฒนาเพื่อการเรียนรู้และแสดงผลงาน ข้อมูลตัวอย่างและรหัสผ่านทั้งหมดไม่ใช่ข้อมูลจริงของหน่วยงาน
