/* eslint-disable @angular-eslint/prefer-inject */

import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

import {
  IonActionSheet,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonProgressBar,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";

import { OverlayEventDetail } from '@ionic/core/components';
import { AuthService } from 'src/app/services/auth.service';
import { LocalStorageService } from 'src/app/services/local-storage.service';
import { SchoolCRUDService } from 'src/app/services/school-crud.service';


@Component({
  selector: 'app-tab-contact',
  templateUrl: './tab-contact.component.html',
  styleUrls: ['./tab-contact.component.scss'],
  standalone: true,
  imports: [
    IonActionSheet,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonContent,
    IonHeader,
    IonIcon,
    IonProgressBar,
    IonTitle,
    IonToolbar,
  ]
})

export class TabContactComponent implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private localStorage = inject(LocalStorageService);
  private schoolCRUDService = inject(SchoolCRUDService);


  cctShift = '';
  escuela = '';
  telefono = '';

  isLoading = true;

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

  private readonly CCT_KEY = this.localStorage.CCT_KEY;
  private readonly SHIFT_KEY = this.localStorage.SHIFT_KEY;

  ngOnInit() {
    const cct = this.localStorage.getKey(this.CCT_KEY);
    const shift = this.localStorage.getKey(this.SHIFT_KEY);
    this.cctShift = `${cct}${shift}`;

    this.loadSchoolContact();
  }

  onLogout(event: CustomEvent<OverlayEventDetail>) {
    const eventButton = event.detail.data;

    if(!eventButton || eventButton.action === 'cancel') {
      return;
    }

    this.authService.logout().subscribe({
      next: () => {
        this.router.navigateByUrl('/auth');
      },
      error: error => {
        console.log('❌ Schoolify: [tab-contact.component.ts]',  error);
      }
    });
  }

  /**
   * Los datos de contacto salen del documento de la escuela, no del perfil de un
   * maestro: el telefono es un dato de la escuela y antes dependia de que existiera
   * un usuario con rol maestro que ademas lo hubiera llenado.
   */
  private async loadSchoolContact() {
    const school = await this.schoolCRUDService.getMySchool(this.cctShift);

    this.escuela = school?.nombre ?? '';
    this.telefono = school?.telefono ?? '';
    this.isLoading = false;
  }
}
