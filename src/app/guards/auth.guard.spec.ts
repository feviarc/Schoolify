import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CanActivateChildFn,
  CanActivateFn,
  provideRouter,
  Route,
  Router,
  Routes,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { AuthGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { UserProfileService } from '../services/user-profile.service';


@Component({ selector: 'app-spec-portal', template: 'portal' })
class SpecPortalComponent {}

@Component({ selector: 'app-spec-auth', template: 'auth' })
class SpecAuthComponent {}

@Component({ selector: 'app-spec-dashboard', template: 'dashboard' })
class SpecDashboardComponent {}

@Component({ selector: 'app-spec-tab-users', template: 'tab-users' })
class SpecTabUsersComponent {}

@Component({ selector: 'app-spec-tab-schools', template: 'tab-schools' })
class SpecTabSchoolsComponent {}


/**
 * Misma FORMA que app.routes.ts: el padre declara `loadComponent` y
 * `data.expectedRole`, y los hijos son rutas anidadas sin `data` propia.
 */
function buildRoutes(guards: {
  canActivate: Route['canActivate'];
  canActivateChild: Route['canActivateChild'];
}): Routes {
  return [
    { path: '', redirectTo: 'portal', pathMatch: 'full' },
    { path: 'portal', component: SpecPortalComponent },
    { path: 'auth', component: SpecAuthComponent },
    {
      path: 'admin-dashboard',
      loadComponent: () => Promise.resolve(SpecDashboardComponent),
      canActivate: guards.canActivate,
      canActivateChild: guards.canActivateChild,
      data: { expectedRole: 'administrador' },
      children: [
        { path: 'tab-users', component: SpecTabUsersComponent },
        { path: 'tab-schools', component: SpecTabSchoolsComponent },
      ],
    },
    { path: '**', redirectTo: 'portal' },
  ];
}


describe('AuthGuard: contrato del router', () => {

  interface GuardCall {
    type: 'canActivate' | 'canActivateChild';
    path: string | undefined;
    data: Record<string, unknown>;
    parentData: Record<string, unknown> | null;
  }

  let calls: GuardCall[];

  const spyCanActivate: CanActivateFn = (route) => {
    calls.push({
      type: 'canActivate',
      path: route.routeConfig?.path,
      data: route.data,
      parentData: route.parent?.data ?? null,
    });
    return true;
  };

  const spyCanActivateChild: CanActivateChildFn = (childRoute) => {
    calls.push({
      type: 'canActivateChild',
      path: childRoute.routeConfig?.path,
      data: childRoute.data,
      parentData: childRoute.parent?.data ?? null,
    });
    return true;
  };

  beforeEach(() => {
    calls = [];

    TestBed.configureTestingModule({
      providers: [
        provideRouter(buildRoutes({
          canActivate: [spyCanActivate],
          canActivateChild: [spyCanActivateChild],
        })),
      ],
    });
  });

  it('entrega al canActivateChild el snapshot HOJA y su data NO trae expectedRole', async () => {
    await RouterTestingHarness.create('/admin-dashboard/tab-users');

    const childCall = calls.find(call => call.type === 'canActivateChild');

    expect(childCall).toBeDefined();
    expect(childCall!.path).toBe('tab-users');
    // Los hijos no heredan `data` cuando el padre tiene componente:
    // por eso canActivateChild no puede leer expectedRole del propio childRoute.
    expect(childCall!.data['expectedRole']).toBeUndefined();
    expect(childCall!.parentData!['expectedRole']).toBe('administrador');
  });

  it('en un deep link, canActivate del padre corre antes que canActivateChild del hijo', async () => {
    await RouterTestingHarness.create('/admin-dashboard/tab-users');

    expect(calls.map(call => call.type)).toEqual(['canActivate', 'canActivateChild']);
  });

  it('al navegar entre pestañas hermanas, el canActivate del padre no se re-ejecuta', async () => {
    const harness = await RouterTestingHarness.create('/admin-dashboard/tab-users');

    calls = [];
    await harness.navigateByUrl('/admin-dashboard/tab-schools');

    // Solo corre el guard del hijo: por eso el estado compartido era la unica
    // fuente de decision en esa navegacion.
    expect(calls.map(call => call.type)).toEqual(['canActivateChild']);
  });

});


describe('AuthGuard: comportamiento real', () => {

  let role: string;
  let emailVerified: boolean;
  let hasUser: boolean;
  let router: Router;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    role = 'administrador';
    emailVerified = true;
    hasUser = true;

    TestBed.configureTestingModule({
      providers: [
        provideRouter(buildRoutes({
          canActivate: [AuthGuard],
          canActivateChild: [AuthGuard],
        })),
        {
          provide: AuthService,
          useValue: {
            getCurrentUser: () => of(hasUser ? { uid: 'spec-user', emailVerified } : null),
          },
        },
        {
          provide: UserProfileService,
          useValue: {
            getUserProfile: () => of({ rol: role }),
          },
        },
      ],
    });

    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  it('permite el acceso al subarbol con el rol correcto', async () => {
    await harness.navigateByUrl('/admin-dashboard/tab-users');

    expect(router.url).toBe('/admin-dashboard/tab-users');
  });

  it('redirige a /portal si el rol no coincide', async () => {
    role = 'tutor';

    await harness.navigateByUrl('/admin-dashboard/tab-users');

    expect(router.url).toBe('/portal');
  });

  it('redirige a /auth si el correo no esta verificado', async () => {
    emailVerified = false;

    await harness.navigateByUrl('/admin-dashboard/tab-users');

    expect(router.url).toBe('/auth');
  });

  it('redirige a /portal si no hay sesion', async () => {
    hasUser = false;

    await harness.navigateByUrl('/admin-dashboard/tab-users');

    expect(router.url).toBe('/portal');
  });

  it('REVALIDA el rol al cambiar de pestana (regresion de la observacion 2)', async () => {
    await harness.navigateByUrl('/admin-dashboard/tab-users');
    expect(router.url).toBe('/admin-dashboard/tab-users');

    // El rol cambia en Firestore con la sesion abierta: el padre ya esta
    // activado, asi que su canActivate NO se vuelve a ejecutar.
    role = 'tutor';
    await harness.navigateByUrl('/admin-dashboard/tab-schools');

    // Con el codigo anterior (flag isCanActivate obsoleto) la navegacion
    // se permitia y la URL quedaba en tab-schools.
    expect(router.url).toBe('/portal');
  });

});
