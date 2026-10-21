import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

import {
  IonApp,
  IonRouterOutlet,
  IonToast,
} from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';

import {
  add,
  book,
  business,
  calendarNumber,
  call,
  checkmarkCircle,
  create,
  laptopOutline,
  logoAndroid,
  logoApple,
  logOutOutline,
  logoWhatsapp,
  mail,
  notifications,
  people,
  person,
  personAdd,
  personRemove,
  power,
  refreshCircle,
  sad,
  school,
  send,
  trash,
} from 'ionicons/icons';

import { AppUpdateService } from './services/app-update.service';
import { AuthService } from './services/auth.service';
import { NotificationService } from './services/notification.service';

import { firstValueFrom } from 'rxjs';


@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrl: 'app.component.scss',
  imports: [
    CommonModule,
    IonApp,
    IonRouterOutlet,
    IonToast,
  ],
})

export class AppComponent implements OnInit{
  private appUpdateService = inject(AppUpdateService);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);


  updateAvailable$ = this.appUpdateService.updateAvailable$;

  /** Aviso cuando la cuenta fue deshabilitada desde el panel del administrador. */
  sessionMessage: string | null = null;

  toastButtons = [{
    text: 'Actualizar',
    icon: 'refresh-circle',
    handler: () => this.updateApp()
  }];

  constructor() {
    addIcons({
      add,
      book,
      business,
      calendarNumber,
      call,
      checkmarkCircle,
      create,
      laptopOutline,
      logoAndroid,
      logoApple,
      logOutOutline,
      logoWhatsapp,
      mail,
      notifications,
      people,
      person,
      personAdd,
      personRemove,
      power,
      refreshCircle,
      sad,
      school,
      send,
      trash,
    });
  }

  ngOnInit() {
    console.log('Versión Actual: [v0.1.0]');
    console.log('🔍 Buscando actualizaciones...');

    this.validateSession();
    this.refreshNotificationsToken();
  }

  updateApp() {
    console.log('🔄 Usuario solicitó actualización');
    this.appUpdateService.applyUpdate();
  }

  /**
   * Renueva el token al arrancar. Si la cuenta fue deshabilitada desde el panel,
   * el servidor rechaza la renovacion (`auth/user-disabled`) y aqui se cierra la
   * sesion con un aviso; sin esto, el usuario deshabilitado seguiria adentro hasta
   * que caducara su token.
   */
  private async validateSession() {
    const user = await firstValueFrom(this.authService.getCurrentUser());

    if(!user) {
      return;
    }

    try {
      await user.getIdToken(true);

    } catch(error) {
      if((error as {code?: string}).code === 'auth/user-disabled') {
        this.sessionMessage = '🚫 Tu cuenta fue deshabilitada. Contacta al administrador de tu escuela.';
        await firstValueFrom(this.authService.logout());
        this.router.navigateByUrl('/auth');
        return;
      }

      console.error('❌ Schoolify: [app.component.ts]', error);
    }
  }

  /**
   * El token FCM puede rotar mientras la app esta cerrada (el navegador y iOS
   * renuevan la suscripcion). Si el dispositivo no lo vuelve a registrar, el
   * servidor conserva un token que FCM ya rechaza y los avisos dejan de llegar
   * hasta el siguiente login. Se registra de nuevo en cada arranque.
   */
  private async refreshNotificationsToken() {
    const user = await firstValueFrom(this.authService.getCurrentUser());

    if(!user) {
      return;
    }

    await this.notificationService.refreshDeviceToken();
  }
}
