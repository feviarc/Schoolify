import { Component, OnInit } from '@angular/core';
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
import { CctStorageService } from 'src/app/services/cct-storage.service';
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

export class TabContactComponent  implements OnInit {

  cct = '';
  escuela = '';
  isLoading = true;
  teachers: UserProfile[] = [];
  telefono = '';

  public logoutActionSheetButtons = [
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

  constructor(
    private router: Router,
    private authService: AuthService,
    private cctStorageService: CctStorageService,
    private userProfileService: UserProfileService,
  ) {}

  ngOnInit() {
    const cct = this.cctStorageService.getCCT();
    this.cct = (cct !== null ? cct : '');

    this.userProfileService.getUsersByRoleAndCCT('maestro', this.cct)
    .pipe(take(1))
    .subscribe({
      next: (users) => {
        this.escuela = users[0].escuela ?? '';
        this.telefono = users[0].telefono ?? '';
        this.isLoading = false;
      },
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-contact.component.ts]', error);
      }
    });
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
        console.log('❌ Escuela-MX: [tab-contact.component.ts]',  error);
      }
    });
  }
}
