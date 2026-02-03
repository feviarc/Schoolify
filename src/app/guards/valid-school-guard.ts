import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SchoolValidationService } from '../services/school-validation.service';
import { firstValueFrom } from 'rxjs';


export const validSchoolGuard: CanActivateFn = async (route, state) => {

  const router = inject(Router);
  const authService = inject(AuthService);
  const schoolValidationService = inject(SchoolValidationService);

  try {
    const user = await firstValueFrom(authService.getCurrentUser());
    if(user) {
      return true;
    }
  } catch(error) {
    console.log('❌ Escuela-MX: [valid-school-guard.ts]', error);
  }

  if(schoolValidationService.getValidationStatus()) {
    return true;
  }

  return router.createUrlTree(['/portal']);
};
