import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccountService } from '../services/account.service';
import { SnackbarService } from '../services/snackbar.service';
import { ApiAvailabilityService } from '../services/api-availability.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const accountService = inject(AccountService);
  const availability = inject(ApiAvailabilityService);
  const router = inject(Router);
  const snack = inject(SnackbarService);

  if (accountService.isAdmin() || availability.unavailable()) {
    return true;
  } else {
    snack.error('Nope');
    router.navigateByUrl('/shop');
    return false;
  }
};
