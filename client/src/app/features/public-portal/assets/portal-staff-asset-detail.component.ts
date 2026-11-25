import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AssetDisposalService,
  DisposalDocument,
} from '../../assetItems/service/asset-disposal.service';
import {
  PublicPortalService,
  PublicPortalStaffAssetDetail,
  PublicPortalStaffAssetItem,
  PublicPortalStaffLookup,
} from '../shared/public-portal.service';

@Component({
  selector: 'app-portal-staff-asset-detail',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterLink],
  templateUrl: './portal-staff-asset-detail.component.html',
})
export class PortalStaffAssetDetailComponent {
  private route = inject(ActivatedRoute);
  private service = inject(PublicPortalService);
  private disposalService = inject(AssetDisposalService);

  // Disposal documents of a single sub-item (a set is not always disposed all at once)
  disposalSub = signal<{ id: number; name: string } | null>(null);
  disposalDocs = signal<DisposalDocument[]>([]);
  disposalLegacy = signal<{
    disposal_date: string;
    disposal_method: string;
    disposal_reason: string | null;
  } | null>(null);
  loadingDisposal = signal(false);
  disposalError = signal('');

  staffId = Number(this.route.snapshot.paramMap.get('staffId'));
  assetId = Number(this.route.snapshot.paramMap.get('assetId'));
  withdrawalId = Number(this.route.snapshot.paramMap.get('withdrawalId'));
  fiscalYearId = this.route.snapshot.queryParamMap.get('fiscal_year_id');
  staff = history.state?.staff as PublicPortalStaffLookup | undefined;
  asset = history.state?.asset as PublicPortalStaffAssetItem | undefined;
  backQueryParams: Record<string, string> = {
    ...(this.fiscalYearId ? { fiscal_year_id: this.fiscalYearId } : {}),
    section: 'assets',
  };
  loading = signal(false);
  detail = signal<PublicPortalStaffAssetDetail | null>(null);

  // Tab State: 'sub_items' | 'repairs' | 'histories'
  activeTab = signal<'sub_items' | 'repairs' | 'histories'>('sub_items');

  selectTab(tab: 'sub_items' | 'repairs' | 'histories') {
    this.activeTab.set(tab);
  }


  constructor() {
    this.loadDetail();
  }

  loadDetail() {
    this.loading.set(true);
    this.service.getStaffAssetDetail(this.staffId, this.assetId, this.withdrawalId).subscribe({
      next: (data) => this.detail.set(data),
      error: (error) => console.error(error),
      complete: () => this.loading.set(false),
    });
  }

  openSubItemDisposal(subItem: { asset_sub_item_id: number; sub_item_name: string }) {
    this.disposalSub.set({ id: subItem.asset_sub_item_id, name: subItem.sub_item_name });
    this.disposalDocs.set([]);
    this.disposalLegacy.set(null);
    this.disposalError.set('');
    this.loadingDisposal.set(true);
    this.disposalService.documents(this.assetId, subItem.asset_sub_item_id).subscribe({
      next: (docs) => {
        this.disposalDocs.set(docs);
        this.loadingDisposal.set(false);
        if (docs.length === 0) {
          // Disposals recorded before documents were attached
          this.disposalService.legacyDisposal(subItem.asset_sub_item_id).subscribe({
            next: (history) => this.disposalLegacy.set(history),
            error: () => {},
          });
        }
      },
      error: () => {
        this.disposalError.set('โหลดข้อมูลการจำหน่ายไม่สำเร็จ');
        this.loadingDisposal.set(false);
      },
    });
  }

  closeSubItemDisposal() {
    this.disposalSub.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeSubItemDisposal();
  }

  openDisposalFile(doc: DisposalDocument) {
    this.disposalService.download(doc.disposal_document_id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: () => this.disposalError.set('เปิดเอกสารไม่สำเร็จ'),
    });
  }

  formatSubItemAssetCode(subItem: any): string {
    if (!subItem) return '-';

    let prefix = '';
    if (subItem.asset_code_end) {
      const slashIdx = subItem.asset_code_end.indexOf('/');
      const mainPart = slashIdx !== -1 ? subItem.asset_code_end.substring(0, slashIdx) : subItem.asset_code_end;
      const lastHyphen = mainPart.lastIndexOf('-');
      if (lastHyphen !== -1) {
        prefix = mainPart.substring(0, lastHyphen);
      } else {
        prefix = mainPart;
      }
    }

    if (!prefix && this.detail()?.project_code) {
      prefix = this.detail()!.project_code;
    }

    const startNo = subItem.running_start_no;
    const endNo = subItem.running_end_no;
    const year = subItem.fiscal_asset_year;

    if (prefix && startNo && endNo && year) {
      const startStr = this.padZero(startNo);
      const endStr = this.padZero(endNo);
      if (startNo === endNo) {
        return `${prefix}-${startStr}/${year}`;
      } else {
        return `${prefix}-${startStr}-${endStr}/${year}`;
      }
    }

    return subItem.asset_code_end || '-';
  }

  getMasterAssetCode(): string {
    const d = this.detail();
    if (!d) return '-';
    if (d.running_start_no && d.running_end_no && d.fiscal_asset_year) {
      const startStr = this.padZero(d.running_start_no);
      const endStr = this.padZero(d.running_end_no);
      const prefix = d.project_code ? d.project_code + '-' : '';
      if (d.running_start_no === d.running_end_no) {
        return `${prefix}${startStr}/${d.fiscal_asset_year}`;
      }
      return `${prefix}${startStr}-${endStr}/${d.fiscal_asset_year}`;
    }
    return '-';
  }

  toThaiDate(dateStr: string | null | undefined, style: 'short' | 'full' | 'numeric' = 'short'): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const day = d.getDate();
    const month = d.getMonth();
    const yearBE = d.getFullYear() + 543;

    if (style === 'numeric') {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      return `${dayStr}/${monthStr}/${yearBE}`;
    }

    const thaiMonthsShort = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];

    const thaiMonthsFull = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    if (style === 'full') {
      return `${day} ${thaiMonthsFull[month]} ${yearBE}`;
    }

    return `${day} ${thaiMonthsShort[month]} ${yearBE}`;
  }

  private padZero(num: number): string {
    if (!num) return '0000';
    const str = String(num);
    return str.padStart(4, '0');
  }
}


