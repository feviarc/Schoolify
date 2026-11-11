import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { switchMap } from 'rxjs/operators';

import {
  IonButtons,
  IonContent,
  IonHeader,
  IonProgressBar,
  IonTitle,
  IonToolbar, IonList, IonItemSliding, IonItem, IonLabel,
  IonMenuButton,
} from "@ionic/angular/standalone";

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
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonItemSliding,
    IonLabel,
    IonList,
    IonProgressBar,
    IonTitle,
    IonToolbar,
    IonMenuButton,
  ]
})

export class TabNotificationsComponent  implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private notificationsCRUDService = inject(AdminNotificationsCRUDService);


  isLoadingData = false;
  notifications: Notification[] = [];
  private notificationsSubscription?: Subscription;
  private getUserSubscription?: Subscription;

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
        console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
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

}
