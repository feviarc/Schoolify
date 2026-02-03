import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs/operators';

import {
  IonActionSheet,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonProgressBar,
  IonTitle,
  IonToolbar, IonList, IonItemSliding, IonItem, IonLabel } from "@ionic/angular/standalone";

import type { OverlayEventDetail } from '@ionic/core/components';
import { Subscription } from 'rxjs';
import { DateFormatPipe } from 'src/app/pipes/date-format.pipe';
import { AuthService } from 'src/app/services/auth.service';
import { AdminNotificationsCRUDService, Notification } from 'src/app/services/admin-notifications-crud.service';


@Component({
  selector: 'app-tab-notifications',
  templateUrl: './tab-notifications.component.html',
  styleUrls: ['./tab-notifications.component.scss'],
  standalone: true,
  imports: [
    DateFormatPipe,
    IonActionSheet,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemSliding,
    IonLabel,
    IonList,
    IonProgressBar,
    IonTitle,
    IonToolbar,
  ]
})

export class TabNotificationsComponent  implements OnInit, OnDestroy {

  isLoadingData = false;
  notifications: Notification[] = [];
  private notificationsSubscription?: Subscription;
  private getUserSubscription?: Subscription;

  public actionSheetButtons = [
    {
      text: 'Aceptar',
      role: 'accept',
      data: {
        action: 'accept',
      },
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
    private notificationsCRUDService: AdminNotificationsCRUDService,
  ) {}

  ngOnInit() {
    this.isLoadingData = true;
    this.getUserSubscription = this.authService.getCurrentUser()
    .pipe(
      switchMap(user => {
        const uid = user?.uid ?? '';
        return this.notificationsCRUDService.getNotifications(uid);
      })
    )
    .subscribe({
      next: notifications => {
        this.notifications = notifications;
        this.isLoadingData = false;
      },
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-notifications.component.ts]', error);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.getUserSubscription) {
      this.getUserSubscription.unsubscribe();
    }

    if(this.notificationsSubscription) {
      this.notificationsSubscription.unsubscribe();
    }
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
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-notifications.component.ts]',  error);
      }
    });
  }
}
