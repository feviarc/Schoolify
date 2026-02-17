import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

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

  updateAvailable$ = this.appUpdateService.updateAvailable$;

  toastButtons = [{
    text: 'Actualizar',
    icon: 'refresh-circle',
    handler: () => this.updateApp()
  }];

  constructor(private appUpdateService: AppUpdateService) {
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
  }

  updateApp() {
    console.log('🔄 Usuario solicitó actualización');
    this.appUpdateService.applyUpdate();
  }
}
