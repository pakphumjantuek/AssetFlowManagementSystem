import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FlatpickrModule } from 'angularx-flatpickr';
import { Thai } from 'flatpickr/dist/l10n/th';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FlatpickrModule],
  templateUrl: './date-picker.component.html',
})
export class DatePickerComponent {
  @Input() label = '';
  @Input() control!: FormControl;
  @Input() placeholder = 'เลือกวันที่';
  @Input() showCalendarIcon = true;
  /** แสดงปุ่มล้างวันที่ (สำหรับช่องที่เว้นว่างได้) */
  @Input() clearable = false;
  private calendar?: { open: () => void; clear: () => void };

  clearDate(): void {
    this.calendar?.clear();
    this.control.setValue(null);
    this.control.markAsDirty();
  }

  openCalendar(): void {
    if (!this.control.disabled) this.calendar?.open();
  }

  thaiLocale = Thai;
  formatThaiYear(event: any) {
    const instance = event.instance ?? event;

    if (!instance) return;
    this.calendar = instance;

    // ช่องปีบนปฏิทินแสดงเป็น พ.ศ. ถ้าผู้ใช้กดลูกศรหรือพิมพ์ปี flatpickr จะอ่านค่านั้นเป็น ค.ศ.
    // (เช่น 2570 กลายเป็นปี ค.ศ. 2570 แล้วแสดงผลเป็น 3113) จึงแปลงกลับเป็น ค.ศ. ที่นี่
    if (typeof instance.currentYear === 'number' && instance.currentYear > 2400) {
      instance.changeYear(instance.currentYear - 543);
      return;
    }

    // เปลี่ยนปีใน input
    if (instance.selectedDates?.length && instance.altInput) {
      const date = instance.selectedDates[0];

      const day = date.getDate();

      const month = date.toLocaleString('th-TH', {
        month: 'long',
      });

      const year = date.getFullYear() + 543;

      instance.altInput.value = `${day} ${month} ${year}`;
    }

    // เปลี่ยนปีบน header calendar
    setTimeout(() => {
      const yearInput = instance.currentYearElement;

      if (yearInput) {
        yearInput.value = String(instance.currentYear + 543);
      }
    });
  }
}
