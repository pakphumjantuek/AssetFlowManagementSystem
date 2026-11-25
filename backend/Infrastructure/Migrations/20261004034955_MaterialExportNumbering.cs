using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MaterialExportNumbering : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "export_book_number",
                table: "procurement_records",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "export_serial_number",
                table: "procurement_records",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "material_export_settings",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    book_number = table.Column<int>(type: "int", nullable: false),
                    next_number = table.Column<int>(type: "int", nullable: false),
                    department_name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    supplies_officer = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    responsibility_text = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_material_export_settings", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_procurement_records_export_book_number_export_serial_number",
                table: "procurement_records",
                columns: new[] { "export_book_number", "export_serial_number" },
                unique: true,
                filter: "[export_book_number] IS NOT NULL AND [export_serial_number] IS NOT NULL");

            migrationBuilder.Sql("INSERT INTO material_export_settings (book_number, next_number, department_name, supplies_officer, responsibility_text) VALUES (1, 1, N'', N'นางสาวเสาวณีย์ หกประเสริฐ', N'โดยข้าพเจ้าจะขอรับผิดชอบตามระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและบริหารพัสดุภาครัฐ พ.ศ. ๒๕๖๐ ทุกประการ และได้รับสิ่งของตามรายการนั้นไปเรียบร้อยแล้ว ตั้งแต่วันที่ {date} หากสิ่งของที่ข้าพเจ้าได้รับไปเกิดการสูญหายขึ้น ข้าพเจ้ายินยอมให้หักเงินเดือนชดใช้ตามที่มหาวิทยาลัยกำหนดจนครบเท่าราคาซื้อ')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "material_export_settings");

            migrationBuilder.DropIndex(
                name: "IX_procurement_records_export_book_number_export_serial_number",
                table: "procurement_records");

            migrationBuilder.DropColumn(
                name: "export_book_number",
                table: "procurement_records");

            migrationBuilder.DropColumn(
                name: "export_serial_number",
                table: "procurement_records");
        }
    }
}
