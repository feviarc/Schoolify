import { CommonModule } from '@angular/common';

import {
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';

import {
  IonAvatar,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonProgressBar,
  IonTitle,
  IonToolbar, IonActionSheet } from "@ionic/angular/standalone";

import type { OverlayEventDetail } from '@ionic/core/components';
import { Observable, Subscription } from 'rxjs';
import { UserProfile } from 'src/app/models/user-profile.model';
import { TeacherDataService } from 'src/app/services/teacher-data.service';


@Component({
  selector: 'app-tab-users',
  templateUrl: './tab-users.component.html',
  styleUrls: ['./tab-users.component.scss'],
  standalone: true,
  imports: [IonActionSheet,
    CommonModule,
    IonAvatar,
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonProgressBar,
    IonTitle,
    IonToolbar,
  ]
})

export class TabUsersComponent  implements OnInit, OnDestroy {

  teachers$!: Observable<UserProfile[]>;
  isLoading = true;

  actionSheetButtons = [
    {
      text: 'Eliminar',
      role: 'destructive',
      data: {
        action: 'delete',
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

  private sub!: Subscription;

  constructor(private teacherDataService: TeacherDataService) {}

  ngOnInit() {
    this.teachers$ = this.teacherDataService.getTeachers();
    this.sub = this.teachers$.subscribe({
      next: () => {
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  onDeleteTeacher(event: CustomEvent<OverlayEventDetail>, teacher: UserProfile) {

    if(!teacher.id || !event.detail.data) {
      return;
    }





  }
}
