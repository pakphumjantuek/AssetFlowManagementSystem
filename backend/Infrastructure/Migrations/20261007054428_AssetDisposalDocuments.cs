using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AssetDisposalDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "assetDisposalDocuments",
                columns: table => new
                {
                    disposal_document_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    asset_id = table.Column<int>(type: "int", nullable: false),
                    asset_sub_item_id = table.Column<int>(type: "int", nullable: true),
                    disposal_date = table.Column<DateTime>(type: "datetime2", nullable: false),
                    document_no = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    stored_filename = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    original_filename = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    content_type = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    actor_id = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true),
                    affected_count = table.Column<int>(type: "int", nullable: false),
                    is_active = table.Column<bool>(type: "bit", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assetDisposalDocuments", x => x.disposal_document_id);
                    table.ForeignKey(
                        name: "FK_assetDisposalDocuments_assetItems_asset_id",
                        column: x => x.asset_id,
                        principalTable: "assetItems",
                        principalColumn: "asset_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_assetDisposalDocuments_assetSubItems_asset_sub_item_id",
                        column: x => x.asset_sub_item_id,
                        principalTable: "assetSubItems",
                        principalColumn: "asset_sub_item_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_assetDisposalDocuments_asset_id",
                table: "assetDisposalDocuments",
                column: "asset_id");

            migrationBuilder.CreateIndex(
                name: "IX_assetDisposalDocuments_asset_sub_item_id",
                table: "assetDisposalDocuments",
                column: "asset_sub_item_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assetDisposalDocuments");
        }
    }
}
