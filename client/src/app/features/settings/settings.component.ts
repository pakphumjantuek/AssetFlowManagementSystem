import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SystemSettingsService } from '../../core/services/system-settings.service';
import { DepartmentService } from '../departments/service/department.service';
import { Params } from '../../shared/models/allType';
import { AccountService } from '../../core/services/account.service';
import { SnackbarService } from '../../core/services/snackbar.service';
import {
  MaterialExportSettings,
  defaultMaterialExportSettings,
} from '../materialWithdrawal/export/material-export-settings';
import { MaterialExportSettingsService } from '../materialWithdrawal/export/material-export-settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIcon, RouterModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  settingsService = inject(SystemSettingsService);
  accountService = inject(AccountService);
  snackbarService = inject(SnackbarService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private materialExportSettingsService = inject(MaterialExportSettingsService);
  private departmentService = inject(DepartmentService);

  // Active category: 'general' (ตั้งค่าทั่วไป) | 'withdrawal' (ตั้งค่าใบเบิก)
  activeTab: 'general' | 'withdrawal' = 'general';

  // System settings state
  projectNameInput = '';
  centralDepartmentInput: number | null = null;
  departmentOptions: Array<{ department_id: number; department_name: string }> = [];
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  isSaving = false;

  // Material Export Settings state
  materialExportSettings: MaterialExportSettings = { ...defaultMaterialExportSettings };

  ngOnInit() {
    this.projectNameInput = this.settingsService.projectName();
    this.centralDepartmentInput = this.settingsService.centralDepartmentId();
    const departmentParams = new Params();
    departmentParams.pageSize = 1000;
    this.departmentService.getDepartments(departmentParams).subscribe({
      next: (res) => (this.departmentOptions = res.data),
      error: () => this.snackbarService.error('โหลดรายชื่อแผนกไม่สำเร็จ'),
    });
    this.materialExportSettingsService.get().subscribe({
      next: settings => this.materialExportSettings = settings,
      error: () => this.snackbarService.error('โหลดการตั้งค่าใบเบิกวัสดุไม่สำเร็จ'),
    });

    // Check query params: ?tab=general or ?tab=withdrawal
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab');
      if (tab === 'withdrawal' || tab === 'general') {
        this.activeTab = tab;
      }
    });
  }

  setTab(tab: 'general' | 'withdrawal') {
    this.activeTab = tab;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
  }

  // --- Material Export Settings Helpers & Actions ---
  get hasDateTag(): boolean {
    return (this.materialExportSettings.responsibilityText || '').includes('{date}');
  }

  insertDateTag() {
    if (!this.materialExportSettings.responsibilityText.includes('{date}')) {
      this.materialExportSettings.responsibilityText =
        (this.materialExportSettings.responsibilityText || '').trimEnd() +
        ' ตั้งแต่วันที่ {date} ';
      this.snackbarService.success('แทรกแท็ก {date} ในข้อความท้ายใบแล้ว');
    } else {
      this.snackbarService.success('มีแท็ก {date} ในข้อความอยู่แล้ว');
    }
  }


  saveMaterialExportSettings() {
    if (!Number.isInteger(this.materialExportSettings.bookNumber) || this.materialExportSettings.bookNumber < 1 ||
        !Number.isInteger(this.materialExportSettings.nextNumber) || this.materialExportSettings.nextNumber < 1) {
      this.snackbarService.error('เลขเล่มและเลขถัดไปต้องเป็นจำนวนเต็มตั้งแต่ 1');
      return;
    }
    if (!this.materialExportSettings.departmentName.trim()) {
      this.snackbarService.error('กรุณาระบุสังกัดหน่วยงานสำหรับใบเบิก');
      return;
    }
    if (!this.materialExportSettings.suppliesOfficer.trim()) {
      this.snackbarService.error('กรุณาระบุชื่อเจ้าหน้าที่พัสดุ');
      return;
    }
    if (!this.materialExportSettings.responsibilityText.includes('{date}')) {
      this.snackbarService.error('ข้อความรับผิดชอบท้ายใบจำเป็นต้องมีแท็ก {date}');
      return;
    }

    this.materialExportSettingsService.save(this.materialExportSettings).subscribe({
      next: settings => {
        this.materialExportSettings = settings;
        this.snackbarService.success('บันทึกการตั้งค่าใบเบิกวัสดุเรียบร้อยแล้ว');
      },
      error: error => this.snackbarService.error(error.error?.message || 'บันทึกการตั้งค่าใบเบิกวัสดุไม่สำเร็จ'),
    });
  }

  resetMaterialExportSettings() {
    if (confirm('คุณต้องการคืนค่าเริ่มต้นสำหรับแบบฟอร์มใบเบิกวัสดุใช่หรือไม่?')) {
      this.materialExportSettings = {
        ...defaultMaterialExportSettings,
        bookNumber: this.materialExportSettings.bookNumber,
        nextNumber: this.materialExportSettings.nextNumber,
      };
      this.snackbarService.success('คืนค่าข้อความเริ่มต้นแล้ว กรุณากดบันทึกเพื่อใช้กับทุกเครื่อง');
    }
  }

  // --- General System Settings Helpers & Actions ---
  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      this.snackbarService.error('อนุญาตเฉพาะไฟล์รูปภาพ (PNG, JPG, JPEG, SVG) เท่านั้น');
      return;
    }

    // Validate size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      this.snackbarService.error('ขนาดรูปภาพต้องไม่เกิน 2MB');
      return;
    }

    this.selectedFile = file;

    // Create preview url
    const reader = new FileReader();
    reader.onload = () => {
      this.previewUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  clearSelectedFile() {
    this.selectedFile = null;
    this.previewUrl = null;
  }

  saveSettings() {
    if (!this.projectNameInput.trim()) {
      this.snackbarService.error('กรุณาระบุชื่อระบบงาน / โครงการ');
      return;
    }

    this.isSaving = true;

    const saveDetails = (logoPath: string) => {
      this.settingsService.updateSystemSettings(this.projectNameInput, logoPath, this.centralDepartmentInput).subscribe({
        next: () => {
          this.settingsService.projectName.set(this.projectNameInput);
          this.settingsService.centralDepartmentId.set(this.centralDepartmentInput);
          if (logoPath) {
            this.settingsService.logoPath.set(logoPath);
          }
          this.selectedFile = null;
          this.previewUrl = null;
          this.snackbarService.success('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว');
          this.isSaving = false;
        },
        error: (err) => {
          console.error(err);
          this.snackbarService.error('ไม่สามารถบันทึกข้อมูลการตั้งค่าได้');
          this.isSaving = false;
        },
      });
    };

    if (this.selectedFile) {
      this.settingsService.uploadLogo(this.selectedFile).subscribe({
        next: (res) => {
          saveDetails(res.logoPath);
        },
        error: (err) => {
          console.error(err);
          this.snackbarService.error('อัปโหลดโลโก้ไม่สำเร็จ');
          this.isSaving = false;
        },
      });
    } else {
      saveDetails(this.settingsService.logoPath());
    }
  }

  resetSettings() {
    if (confirm('คุณต้องการรีเซ็ตการตั้งค่าระบบกลับเป็นค่าเริ่มต้นใช่หรือไม่?')) {
      this.isSaving = true;
      this.settingsService.resetSystemSettings().subscribe({
        next: (res) => {
          this.settingsService.projectName.set(res.project_name);
          this.settingsService.logoPath.set(res.logo_path);
          this.projectNameInput = res.project_name;
          this.selectedFile = null;
          this.previewUrl = null;
          this.snackbarService.success('รีเซ็ตการตั้งค่าระบบเป็นค่าเริ่มต้นเรียบร้อยแล้ว');
          this.isSaving = false;
        },
        error: (err) => {
          console.error(err);
          this.snackbarService.error('รีเซ็ตการตั้งค่าไม่สำเร็จ');
          this.isSaving = false;
        },
      });
    }
  }

  toggleNavbar() {
    this.settingsService.toggleNavbar();
  }
}
