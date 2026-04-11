/* eslint-disable @angular-eslint/prefer-inject */

import { Component, OnDestroy, OnInit } from '@angular/core';

import {
  IonBadge,
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
} from "@ionic/angular/standalone";

import { User } from 'firebase/auth';
import { firstValueFrom, Subscription } from 'rxjs';
import { DateFormatPipe } from 'src/app/pipes/date-format.pipe';
import { AuthService } from 'src/app/services/auth.service';
import { CaregiverNotificationsCRUDService, CaregiverNotification } from 'src/app/services/caregiver-notifications-crud.service';


@Component({
  selector: 'app-tab-notifications',
  templateUrl: './tab-notifications.component.html',
  styleUrls: ['./tab-notifications.component.scss'],
  standalone: true,
  imports: [IonBadge,
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

export class TabNotificationsComponent  implements OnInit, OnDestroy {

  cct!: string;
  tid?: string;

  isLoading = true;

  user: User | null = null;
  notifications: CaregiverNotification[] = [];
  subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private caregiverNotifCRUDService: CaregiverNotificationsCRUDService,
  ) { }

  async ngOnInit() {
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
      console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
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
        console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
      }
    });

    this.subscriptions.push(sub);
  }
}
