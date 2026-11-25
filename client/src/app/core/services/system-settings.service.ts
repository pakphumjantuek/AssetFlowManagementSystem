import { inject, Injectable, signal, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface SystemSettingDto {
  id?: number;
  project_name: string;
  logo_path: string;
  central_department_id?: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class SystemSettingsService {
  private http = inject(HttpClient);
  private baseUrl = environment.baseUrl + 'systemsettings';

  projectName = signal<string>('ระบบบริหารพัสดุ');
  logoPath = signal<string>('/institute-Logo.png');
  // รหัสแผนก "ส่วนกลางพัสดุ" ที่ตั้งค่าไว้ (null = ยังไม่ได้ตั้งค่า)
  centralDepartmentId = signal<number | null>(null);
  settingsLoaded = signal(false);
  navbarVisible = signal<boolean>(true);
  darkMode = signal<boolean>(false);

  constructor() {
    // โหลดการตั้งค่าเปิด-ปิด Navbar จาก LocalStorage
    const savedNavbar = localStorage.getItem('navbarVisible');
    if (savedNavbar !== null) {
      this.navbarVisible.set(savedNavbar === 'true');
    }

    // โหลดการตั้งค่าโหมดมืด (Dark Mode) จาก LocalStorage
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode !== null) {
      const isDark = savedDarkMode === 'true';
      this.darkMode.set(isDark);
      this.applyTheme(isDark);
    }

    // ให้ไอคอนบนแท็บเบราว์เซอร์เปลี่ยนตามโลโก้ที่ตั้งค่าไว้
    effect(() => this.applyFavicon(this.getLogoUrl()));

    // ดึงข้อมูลการตั้งค่าชื่อโปรเจกต์และโลโก้จาก Backend
    this.fetchSystemSettings();
  }

  private applyFavicon(url: string) {
    let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    // ไฟล์โลโก้ที่อัปโหลดอาจเป็น png/jpg/svg จึงไม่ล็อก type ตายตัว
    link.removeAttribute('type');
    link.href = url;
  }

  fetchSystemSettings() {
    this.http.get<SystemSettingDto>(this.baseUrl).subscribe({
      next: (settings) => {
        if (settings) {
          this.projectName.set(settings.project_name);
          this.logoPath.set(settings.logo_path);
          this.centralDepartmentId.set(settings.central_department_id ?? null);
        }
      },
      error: (err) => console.error('Failed to fetch system settings', err),
      complete: () => this.settingsLoaded.set(true),
    });
  }

  updateSystemSettings(projectName: string, logoPath: string, centralDepartmentId: number | null) {
    return this.http.put<void>(this.baseUrl, {
      project_name: projectName,
      logo_path: logoPath,
      central_department_id: centralDepartmentId,
    });
  }

  uploadLogo(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ logoPath: string }>(`${this.baseUrl}/upload-logo`, formData);
  }

  resetSystemSettings() {
    return this.http.post<SystemSettingDto>(`${this.baseUrl}/reset`, {});
  }

  getLogoUrl(): string {
    const logo = this.logoPath();
    // แอปรันอยู่ใต้ sub-path (เช่น /asset/) จึงต้องอ้างอิงไฟล์แบบ relative กับ <base href> ไม่ใช่ root
    const toBaseUrl = (path: string) => new URL(path.replace(/^\/+/, ''), document.baseURI).href;

    if (!logo || logo === '/institute-Logo.png') return toBaseUrl('institute-Logo.png');
    if (logo.startsWith('http')) return logo;
    if (logo.startsWith('/assets') || logo.startsWith('assets/')) return toBaseUrl(logo);
    const apiIndex = this.baseUrl.indexOf('/api/');
    if (apiIndex !== -1) {
      const host = this.baseUrl.substring(0, apiIndex);
      return host + logo;
    }
    return toBaseUrl(logo);
  }

  toggleNavbar() {
    const nextState = !this.navbarVisible();
    this.navbarVisible.set(nextState);
    localStorage.setItem('navbarVisible', String(nextState));
  }

  toggleDarkMode() {
    const nextState = !this.darkMode();
    this.darkMode.set(nextState);
    localStorage.setItem('darkMode', String(nextState));
    this.applyTheme(nextState);
  }

  private applyTheme(isDark: boolean) {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}
