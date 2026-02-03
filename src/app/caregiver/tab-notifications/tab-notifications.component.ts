import { Component, OnInit } from '@angular/core';

import {
  IonChip,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonProgressBar,
  IonText,
  IonTitle,
  IonToolbar
} from "@ionic/angular/standalone";

import { User } from 'firebase/auth';
import { firstValueFrom, Subscription } from 'rxjs';
import { DateFormatPipe } from 'src/app/pipes/date-format.pipe';
import { AuthService } from 'src/app/services/auth.service';
import { CaregiverNotificationsCRUDService, CaregiverNotification } from 'src/app/services/caregiver-notifications-crud.service';
import { CctStorageService } from 'src/app/services/cct-storage.service';


@Component({
  selector: 'app-tab-notifications',
  templateUrl: './tab-notifications.component.html',
  styleUrls: ['./tab-notifications.component.scss'],
  standalone: true,
  imports: [
    DateFormatPipe,
    IonChip,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonProgressBar,
    IonText,
    IonTitle,
    IonToolbar,
  ]
})

export class TabNotificationsComponent  implements OnInit {

  isLoading = true;
  cct!: string;
  user: User | null = null;
  subscriptions: Subscription[] = [];
  tid?: string;
  notifications: CaregiverNotification[] = [];

  constructor(
    private authService: AuthService,
    private caregiverNotifCRUDService: CaregiverNotificationsCRUDService,
    private cctStorageService: CctStorageService,
  ) { }

  async ngOnInit() {
    const cct = this.cctStorageService.getCCT();
    this.cct = (cct !== null ? cct : '');
    await this.getCurrentUser();
    this.loadNotifications();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async getCurrentUser() {
    try {
      this.user = await firstValueFrom(this.authService.getCurrentUser());
      this.tid = this.user?.uid;
    } catch(error) {
      console.log('❌ Escuela-MX: [tab-notifications.component.ts]', error);
    }
  }

  loadNotifications() {
    if(!this.tid) {
      return;
    }

    const sub = this.caregiverNotifCRUDService.getNotificationsByTid(this.tid).subscribe({
      next: (notificatios) => {
        this.isLoading = false;
        this.notifications = notificatios;
      },
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-notifications.component.ts]', error);
      }
    });

    this.subscriptions.push(sub);
  }
}
