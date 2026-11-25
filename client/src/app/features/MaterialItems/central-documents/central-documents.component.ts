import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CentralMaterialItem } from '../interface/materialItemsTypes';
import { MaterialItemsService } from '../service/materialItems.service';

@Component({
  selector: 'app-central-documents',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  templateUrl: './central-documents.component.html',
})
export class CentralDocumentsComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private materials = inject(MaterialItemsService);

  item = signal<CentralMaterialItem | null>(null);
  documentSearch = signal('');
  filteredRows = computed(() => {
    const rows = this.item()?.rows ?? [];
    const search = this.documentSearch().trim().toLocaleLowerCase();
    return search ? rows.filter((row) => row.document_no.toLocaleLowerCase().includes(search)) : rows;
  });
  unassignedQuantity = signal(0);
  loading = signal(true);
  error = signal(false);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(() => this.load());
  }

  private load(): void {
    const id = Number(this.route.snapshot.paramMap.get('materialItemId'));
    if (!Number.isInteger(id) || id <= 0) {
      this.router.navigate(['/admin/MaterialItem/by-department/12']);
      return;
    }
    const year = Number(this.route.snapshot.queryParamMap.get('fiscal_year_id')) || null;
    this.loading.set(true);
    this.error.set(false);
    this.materials.getCentralAvailable(year, undefined, id).subscribe({
      next: (res) => {
        this.item.set(res.items.find((item) => item.material_item_id === id) ?? null);
        this.unassignedQuantity.set(res.unassigned
          .filter((row) => row.material_item_id === id)
          .reduce((sum, row) => sum + row.quantity, 0));
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  backUrl(): string {
    return '/admin/MaterialItem/by-department/12';
  }

  fiscalYearId(): number | null {
    return Number(this.route.snapshot.queryParamMap.get('fiscal_year_id')) || null;
  }

  onDocumentSearch(event: Event): void {
    this.documentSearch.set((event.target as HTMLInputElement).value);
  }
}
