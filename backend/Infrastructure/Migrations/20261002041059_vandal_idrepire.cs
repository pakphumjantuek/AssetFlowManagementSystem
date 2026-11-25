using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class vandal_idrepire : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "vendor_id",
                table: "assetRepairs",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_assetRepairs_vendor_id",
                table: "assetRepairs",
                column: "vendor_id");

            migrationBuilder.AddForeignKey(
                name: "FK_assetRepairs_vendors_vendor_id",
                table: "assetRepairs",
                column: "vendor_id",
                principalTable: "vendors",
                principalColumn: "vendor_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_assetRepairs_vendors_vendor_id",
                table: "assetRepairs");

            migrationBuilder.DropIndex(
                name: "IX_assetRepairs_vendor_id",
                table: "assetRepairs");

            migrationBuilder.DropColumn(
                name: "vendor_id",
                table: "assetRepairs");
        }
    }
}
