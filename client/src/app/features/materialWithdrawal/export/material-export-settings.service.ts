import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { MaterialExportSettings } from './material-export-settings';

@Injectable({ providedIn: 'root' })
export class MaterialExportSettingsService {
  private http = inject(HttpClient);
  private url = environment.baseUrl + 'MaterialExportSettings';

  get() { return this.http.get<MaterialExportSettings>(this.url); }
  save(settings: MaterialExportSettings) { return this.http.put<MaterialExportSettings>(this.url, settings); }
}
