import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, EMPTY, Subscription, switchMap, timeout, timer } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiAvailabilityService {
  private http = inject(HttpClient);
  private retrySubscription?: Subscription;
  private returnUrl = '';
  readonly unavailable = signal(false);

  isConnectionFailure(error: HttpErrorResponse): boolean {
    return error.status === 0 || [502, 503, 504].includes(error.status);
  }

  markUnavailable(): void {
    if (this.unavailable()) return;
    this.returnUrl = window.location.pathname + window.location.search + window.location.hash;
    this.unavailable.set(true);
    this.retrySubscription = timer(5000, 5000).pipe(
      switchMap(() => this.http.get(`${environment.baseUrl}account/auth-status`).pipe(
        timeout(5000),
        catchError(() => EMPTY),
      )),
    ).subscribe(() => {
      this.retrySubscription?.unsubscribe();
      window.location.assign(this.returnUrl || '/');
    });
  }
}
