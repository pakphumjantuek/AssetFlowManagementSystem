using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    public partial class ProcurementRecordDecreeAndWithdrawal : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "decree_document_no", table: "procurement_records", type: "nvarchar(max)", nullable: true);
            migrationBuilder.AddColumn<string>(name: "withdrawal_document_no", table: "procurement_records", type: "nvarchar(32)", maxLength: 32, nullable: true);
            migrationBuilder.CreateIndex(name: "IX_procurement_records_withdrawal_document_no", table: "procurement_records", column: "withdrawal_document_no", unique: true, filter: "[withdrawal_document_no] IS NOT NULL");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_procurement_records_withdrawal_document_no", table: "procurement_records");
            migrationBuilder.DropColumn(name: "decree_document_no", table: "procurement_records");
            migrationBuilder.DropColumn(name: "withdrawal_document_no", table: "procurement_records");
        }
    }
}