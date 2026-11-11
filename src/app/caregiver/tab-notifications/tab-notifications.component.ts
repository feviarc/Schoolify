/* eslint-disable @angular-eslint/prefer-inject */

import { Component, OnDestroy, OnInit, inject } from '@angular/core';

import {
  IonBadge,
  IonButton,
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
  IonMenuButton,
  IonButtons,
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
    IonButton,
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
    IonMenuButton,
    IonButtons,
  ]
})

export class TabNotificationsComponent  implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private caregiverNotifCRUDService = inject(CaregiverNotificationsCRUDService);


  cct!: string;
  tid?: string;

  isLoading = true;

  user: User | null = null;
  notifications: CaregiverNotification[] = [];
  subscriptions: Subscription[] = [];

  private acknowledgingIds = new Set<string>();

  async ngOnInit() {
    await this.getCurrentUser();
    this.loadNotifications();
  }

  /**
   * Marca el aviso como visto cuando el tutor lo abre. Es automatico y sin efecto
   * visible para el: sirve para que el maestro sepa que el mensaje llego.
   */
  async onSee(notification: CaregiverNotification) {
    if(!notification.id || notification.leido || !this.tid) {
      return;
    }

    try {
      await this.caregiverNotifCRUDService.markAsSeen(this.tid, notification.id);
    } catch(error) {
      console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
    }
  }

  /** True mientras el acuse esta en vuelo o ya se confirmo localmente. */
  isAcknowledging(notification: CaregiverNotification): boolean {
    return !!notification.id && this.acknowledgingIds.has(notification.id);
  }

  /** El tutor confirma que recibio el aviso. Acuse de un solo sentido. */
  async onAcknowledge(notification: CaregiverNotification) {
    if(!notification.id || notification.acknowledged || !this.tid) {
      return;
    }

    if(this.acknowledgingIds.has(notification.id)) {
      return;
    }

    // Se oculta el boton al instante para que no se confunda con la etiqueta; si la
    // escritura falla, vuelve el boton para poder reintentar.
    this.acknowledgingIds.add(notification.id);

    try {
      await this.caregiverNotifCRUDService.acknowledge(this.tid, notification.id);
    } catch(error) {
      this.acknowledgingIds.delete(notification.id);
      console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
    }
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
