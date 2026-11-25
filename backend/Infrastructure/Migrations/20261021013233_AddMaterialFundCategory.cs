using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMaterialFundCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "fund_category_id",
                table: "materialItems",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_materialItems_fund_category_id",
                table: "materialItems",
                column: "fund_category_id");

            migrationBuilder.AddForeignKey(
                name: "FK_materialItems_fund_categories_fund_category_id",
                table: "materialItems",
                column: "fund_category_id",
                principalTable: "fund_categories",
                principalColumn: "fund_category_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_materialItems_fund_categories_fund_category_id",
                table: "materialItems");

            migrationBuilder.DropIndex(
                name: "IX_materialItems_fund_category_id",
                table: "materialItems");

            migrationBuilder.DropColumn(
                name: "fund_category_id",
                table: "materialItems");
        }
    }
}
