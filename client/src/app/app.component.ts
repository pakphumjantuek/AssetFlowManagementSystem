import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ApiAvailabilityService } from './core/services/api-availability.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'AssetFlowManagementSystem';
  readonly apiAvailability = inject(ApiAvailabilityService);
}
