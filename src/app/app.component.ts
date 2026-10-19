import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';

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


  updateAvailable$ = this.appUpdateService.updateAvailable$;

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

    this.refreshNotificationsToken();
  }

  updateApp() {
    console.log('🔄 Usuario solicitó actualización');
    this.appUpdateService.applyUpdate();
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
