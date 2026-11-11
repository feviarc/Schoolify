import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

import {
  IonActionSheet,
  IonAvatar,
  IonButton,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenu,
  IonNote,
  IonTitle,
  IonToolbar,
  MenuController,
} from '@ionic/angular/standalone';

import type { OverlayEventDetail } from '@ionic/core/components';
import { Subscription, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { UserProfile } from '../models/user-profile.model';
import { AuthService } from '../services/auth.service';
import { SchoolCRUDService } from '../services/school-crud.service';
import { UserProfileService } from '../services/user-profile.service';


@Component({
  selector: 'app-main-menu',
  templateUrl: './main-menu.component.html',
  styleUrls: ['./main-menu.component.scss'],
  standalone: true,
  imports: [
    IonActionSheet,
    IonAvatar,
    IonButton,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonMenu,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
})

export class MainMenuComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private menuController = inject(MenuController);
  private router = inject(Router);
  private schoolCRUDService = inject(SchoolCRUDService);
  private userProfileService = inject(UserProfileService);


  nombre = '';
  email = '';
  rol = '';
  escuela = '';
  turno = '';
  iniciales = '?';
  isLoggedIn = false;
  /** El gesto de abrir el menu solo se habilita en los tableros, no en el portal. */
  swipeEnabled = false;

  logoutActionSheetButtons = [
    {
      text: 'Aceptar',
      role: 'accept',
      data: {
        action: 'accept',
      }
    },
    {
      text: 'Cancelar',
      role: 'cancel',
      data: {
        action: 'cancel',
      },
    },
  ];

  private subscriptions: Subscription[] = [];

  get rolLabel(): string {
    switch(this.rol) {
      case 'administrador': return 'Administrador';
      case 'prefecto': return 'Prefecto';
      case 'maestro': return 'Maestro';
      case 'tutor': return 'Tutor';
      default: return 'Sin rol';
    }
  }

  ngOnInit() {
    this.updateRouteState();

    const routeSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.updateRouteState());

    // Al iniciar sesion sin recargar la app, el menu debe enterarse del usuario.
    const authSub = this.authService.getCurrentUser()
      .subscribe(() => this.loadProfile());

    this.subscriptions.push(routeSub, authSub);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /** Se relee al abrir el menu para no mostrar un nombre viejo. */
  refresh() {
    this.loadProfile(true);
  }

  async onLogout(event: CustomEvent<OverlayEventDetail>) {
    if(event.detail.data?.action !== 'accept') {
      return;
    }

    // Cierra el sidebar antes de salir: si no, queda abierto encima del login.
    await this.menuController.close();
    this.isLoggedIn = false;
    await firstValueFrom(this.authService.logout());
    this.router.navigateByUrl('/auth');
  }

  private updateRouteState() {
    this.swipeEnabled = ['/admin-dashboard', '/prefect-dashboard', '/caregiver-dashboard']
      .some(path => this.router.url.startsWith(path));

    // Al salir de un tablero (logout, cuenta deshabilitada, portal) el sidebar no
    // debe quedar abierto encima de la pantalla publica.
    if(!this.swipeEnabled) {
      this.menuController.close();
    }
  }

  private async loadProfile(forceRefresh = false) {
    try {
      const user = await firstValueFrom(this.authService.getCurrentUser());
      const uid = user?.uid ?? '';

      if(!uid) {
        this.reset();
        return;
      }

      const profile = await firstValueFrom(this.userProfileService.getUserProfile(uid, forceRefresh));

      if(!profile) {
        this.reset();
        return;
      }

      this.applyProfile(profile, user?.email ?? '');
      await this.loadSchool(profile.cct);
    } catch(error) {
      console.log('❌ Schoolify: [main-menu.component.ts]', error);
    }
  }

  private applyProfile(profile: UserProfile, authEmail: string) {
    this.isLoggedIn = true;
    this.email = profile.email || authEmail;
    this.rol = profile.rol ?? '';
    this.nombre = profile.nombre?.trim() || this.email.split('@')[0] || 'Usuario';
    this.iniciales = this.buildIniciales(profile.nombre ?? '', this.email);
  }

  private async loadSchool(cct?: string) {
    try {
      const school = await this.schoolCRUDService.getMySchool(cct);
      this.escuela = school?.nombre ?? (cct ?? '');
      this.turno = this.turnoLabel(school?.turno);
    } catch(error) {
      console.log('❌ Schoolify: [main-menu.component.ts]', error);
      this.escuela = cct ?? '';
      this.turno = '';
    }
  }

  private turnoLabel(turno?: string): string {
    switch(turno) {
      case 'TM': return 'Matutino';
      case 'TT': return 'Vespertino';
      default: return '';
    }
  }

  private buildIniciales(nombre: string, email: string): string {
    const limpio = nombre.trim();

    if(limpio) {
      return limpio.split(/\s+/)
        .slice(0, 2)
        .map(parte => parte[0])
        .join('')
        .toUpperCase();
    }

    return (email.trim()[0] ?? '?').toUpperCase();
  }

  private reset() {
    this.nombre = '';
    this.email = '';
    this.rol = '';
    this.escuela = '';
    this.turno = '';
    this.iniciales = '?';
    this.isLoggedIn = false;
  }
}
