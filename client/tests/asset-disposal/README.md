# ตรวจการจำหน่ายด้วยเอกสาร

ใช้ SQLite ในหน่วยความจำและไฟล์ในโฟลเดอร์ชั่วคราว ไม่เรียก Program ของ API และไม่เขียนฐานข้อมูลจริง

รันจาก client ด้วย PowerShell โดยแยก output เพื่อไม่ชนกับ API ที่เปิดอยู่:

```powershell
$testOutput = Join-Path (Get-Location) '.disposal-test-build'
dotnet run --project tests/asset-disposal/AssetDisposal.Check.csproj "-p:OutputPath=$testOutput\"
```

ตรวจ validation, สถานะบางส่วน/ทั้งหมด, เอกสารร่วมของชุด, การเก็บหลักฐานเดิม, ป้องกันจำหน่ายซ้ำ, ดาวน์โหลด, ผู้บันทึก และ rollback ทั้งไฟล์/สถานะเมื่อ database save ล้มเหลว
