import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FacultyMaterialStock } from '../interface/facultyStockTypes';
import { MaterialItemsService } from '../service/materialItems.service';
import { SystemSettingsService } from '../../../core/services/system-settings.service';

@Component({
  selector: 'app-faculty-stock-detail', standalone: true,
  imports: [DecimalPipe, RouterLink],
  templateUrl: './faculty-stock-detail.component.html',
})
export class FacultyStockDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private service = inject(MaterialItemsService);
  private settings = inject(SystemSettingsService);
  isCentral = (departmentId: number) => departmentId === this.settings.centralDepartmentId();
  item = signal<FacultyMaterialStock | null>(null);
  loading = signal(true);
  error = signal(false);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(() => this.load());
  }

  private load(): void {
    const id = Number(this.route.snapshot.paramMap.get('materialItemId'));
    if (!Number.isInteger(id) || id <= 0) {
      this.router.navigate(['/admin/MaterialItem/faculty-stock']);
      return;
    }
    const yearId = Number(this.route.snapshot.queryParamMap.get('fiscal_year_id')) || null;
    this.loading.set(true);
    this.error.set(false);
    this.service.getFacultyStock(yearId, undefined, id).subscribe({
      next: (res) => {
        this.item.set(res.items.find((item) => item.material_item_id === id) ?? null);
        this.loading.set(false);
      },
      error: () => { this.error.set(true); this.loading.set(false); },
    });
  }
}
