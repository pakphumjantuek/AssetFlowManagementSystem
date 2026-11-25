import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { ApiAvailabilityService } from '../services/api-availability.service';

export const authGuard: CanActivateFn = (route, state) => {
  const accountService = inject(AccountService);
  const availability = inject(ApiAvailabilityService);
  const router = inject(Router);

  if (accountService.currentUser() || availability.unavailable()) {
    return true;
  } else {
    router.navigate(['/account/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }
};
