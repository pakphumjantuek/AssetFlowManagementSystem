export interface MaterialExportSettings {
  bookNumber: number;
  nextNumber: number;
  departmentName: string;
  suppliesOfficer: string;
  responsibilityText: string;
}

export const defaultMaterialExportSettings: MaterialExportSettings = {
  bookNumber: 1,
  nextNumber: 1,
  departmentName: '',
  suppliesOfficer: 'นางสาวเสาวณีย์ หกประเสริฐ',
  responsibilityText: 'โดยข้าพเจ้าจะขอรับผิดชอบตามระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและบริหารพัสดุภาครัฐ พ.ศ. ๒๕๖๐ ทุกประการ และได้รับสิ่งของตามรายการนั้นไปเรียบร้อยแล้ว ตั้งแต่วันที่ {date} หากสิ่งของที่ข้าพเจ้าได้รับไปเกิดการสูญหายขึ้น ข้าพเจ้ายินยอมให้หักเงินเดือนชดใช้ตามที่มหาวิทยาลัยกำหนดจนครบเท่าราคาซื้อ',
};
