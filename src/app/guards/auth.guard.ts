import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanActivateChild,
  GuardResult,
  MaybeAsync,
  Router,
  RouterStateSnapshot,
  UrlTree
} from '@angular/router';
import { Observable, map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UserProfileService } from '../services/user-profile.service';


@Injectable({providedIn: 'root'})

export class AuthGuard implements CanActivate, CanActivateChild {

  private isCanActivate: boolean = false;

  constructor(
    private authService: AuthService,
    private userProfileService: UserProfileService,
    private router: Router
  ) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> {

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
              this.isCanActivate = true;
              return this.isCanActivate;
            } else {
              return this.router.createUrlTree(['/portal']);
            }
          })
        );
      })
    );
  }

  canActivateChild(childRoute: ActivatedRouteSnapshot, state: RouterStateSnapshot): MaybeAsync<GuardResult> {
    return this.isCanActivate;
  }

}
