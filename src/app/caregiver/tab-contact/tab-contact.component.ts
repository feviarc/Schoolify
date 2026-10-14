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
import { take } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { LocalStorageService } from 'src/app/services/local-storage.service';
import { SchoolCRUDService } from 'src/app/services/school-crud.service';
import { UserProfile } from 'src/app/models/user-profile.model';
import { UserProfileService } from 'src/app/services/user-profile.service';


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
  private userProfileService = inject(UserProfileService);


  cctShift = '';
  escuela = '';
  telefono = '';

  isLoading = true;

  teachers: UserProfile[] = [];

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

    this.loadSchoolName();
    this.loadTeacherContact();
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
   * El nombre de la escuela sale del documento de la escuela (funcion `getMySchool`),
   * que es la fuente confiable: el perfil del maestro puede tenerlo vacio.
   */
  private async loadSchoolName() {
    const school = await this.schoolCRUDService.getMySchool(this.cctShift);

    if(school?.nombre) {
      this.escuela = school.nombre;
    }
  }

  /**
   * El telefono es del maestro de la escuela. Si no hay ninguno registrado, o no
   * dejo telefono, la tarjeta lo dice en lugar de quedarse cargando para siempre.
   */
  private loadTeacherContact() {
    this.userProfileService.getUsersByRoleAndCCT('maestro', this.cctShift)
    .pipe(take(1))
    .subscribe({
      next: (teachers) => {
        const teacher = teachers[0];

        if(!teacher) {
          console.warn(`⚠️ Schoolify: [tab-contact.component.ts] sin maestro registrado para ${this.cctShift}`);
          this.isLoading = false;
          return;
        }

        this.escuela = teacher.escuela || this.escuela;
        this.telefono = teacher.telefono ?? '';
        this.isLoading = false;
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-contact.component.ts]', error);
        this.isLoading = false;
      }
    });
  }
}
