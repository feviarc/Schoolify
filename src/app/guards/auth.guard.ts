import { Injectable, inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanActivateChild,
  Router,
  RouterStateSnapshot,
  UrlTree
} from '@angular/router';
import { Observable, map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UserProfileService } from '../services/user-profile.service';


@Injectable({providedIn: 'root'})

export class AuthGuard implements CanActivate, CanActivateChild {
  private authService = inject(AuthService);
  private userProfileService = inject(UserProfileService);
  private router = inject(Router);


  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> {
    return this.checkAccess(route);
  }

  canActivateChild(childRoute: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> {
    return this.checkAccess(this.findRoleOwner(childRoute));
  }

  /**
   * El `data.expectedRole` vive en la ruta que declara el guard, no en el hijo:
   * con la estrategia de herencia por defecto ('emptyOnly') los hijos no heredan
   * `data` cuando el padre tiene componente propio.
   * El router entrega el snapshot hoja, así que se sube por los ancestros.
   */
  private findRoleOwner(childRoute: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
    let route: ActivatedRouteSnapshot | null = childRoute.parent;

    while (route) {
      if (route.data['expectedRole']) {
        return route;
      }
      route = route.parent;
    }

    return childRoute;
  }

  private checkAccess(route: ActivatedRouteSnapshot): Observable<boolean | UrlTree> {

    const expectedRole = route.data['expectedRole'];

    return this.authService.getCurrentUser().pipe(
      switchMap(user => {

        if(!user) {
          return of(this.router.createUrlTree(['/portal']));
        }

        if(!user.emailVerified) {
          return of(this.router.createUrlTree(['/auth']));
        }

        return this.userProfileService.getUserProfile(user.uid).pipe(
          map(profile => {
            if(profile && profile.rol === expectedRole) {
              return true;
            } else {
              return this.router.createUrlTree(['/portal']);
            }
          })
        );
      })
    );
  }

}
