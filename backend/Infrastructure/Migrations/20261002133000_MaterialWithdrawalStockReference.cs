using Infrastructure;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations;

[DbContext(typeof(StoreContext))]
[Migration("20261002133000_MaterialWithdrawalStockReference")]
public class MaterialWithdrawalStockReference : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "material_withdrawal_id",
            table: "materialStockCards",
            type: "int",
            nullable: true);

        // Preserve the link for stock cards created before this column existed.
        migrationBuilder.Sql("""
            UPDATE sc
            SET sc.material_withdrawal_id = mw.material_withdrawal_id,
                sc.reference_document_no = pr.document_no
            FROM materialStockCards AS sc
            INNER JOIN materialWithdrawals AS mw
                ON mw.material_withdrawal_id = TRY_CONVERT(int, SUBSTRING(sc.reference_document_no, 4, 100))
            INNER JOIN procurement_records AS pr
                ON pr.procurement_record_id = mw.procurement_record_id
            WHERE sc.reference_document_no LIKE 'MW-%'
              AND sc.reference_document_no = CONCAT('MW-', mw.material_withdrawal_id);

            UPDATE sc
            SET sc.reference_document_no = pr.document_no
            FROM materialStockCards AS sc
            INNER JOIN procurement_records AS pr
                ON pr.procurement_record_id = sc.procurement_record_id
            WHERE sc.reference_document_no LIKE 'MW-%'
              AND sc.material_withdrawal_id IS NULL;
            """);

        migrationBuilder.CreateIndex(
            name: "IX_materialStockCards_material_withdrawal_id",
            table: "materialStockCards",
            column: "material_withdrawal_id");

        migrationBuilder.AddForeignKey(
            name: "FK_materialStockCards_materialWithdrawals_material_withdrawal_id",
            table: "materialStockCards",
            column: "material_withdrawal_id",
            principalTable: "materialWithdrawals",
            principalColumn: "material_withdrawal_id",
            onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE materialStockCards
            SET reference_document_no = CONCAT('MW-', material_withdrawal_id)
            WHERE material_withdrawal_id IS NOT NULL;
            """);

        migrationBuilder.DropForeignKey(
            name: "FK_materialStockCards_materialWithdrawals_material_withdrawal_id",
            table: "materialStockCards");
        migrationBuilder.DropIndex(
            name: "IX_materialStockCards_material_withdrawal_id",
            table: "materialStockCards");
        migrationBuilder.DropColumn(
            name: "material_withdrawal_id",
            table: "materialStockCards");
    }
}
