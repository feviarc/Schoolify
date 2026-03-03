import { CommonModule } from '@angular/common';

import {
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';

import {
  IonActionSheet,
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
} from "@ionic/angular/standalone";

import type { OverlayEventDetail } from '@ionic/core/components';
import { Subscription } from 'rxjs';
import { UserProfile } from 'src/app/models/user-profile.model';
import { TeacherDataService } from 'src/app/services/teacher-data.service';


@Component({
  selector: 'app-tab-users',
  templateUrl: './tab-users.component.html',
  styleUrls: ['./tab-users.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonActionSheet,
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

  teachers: UserProfile[] = [];
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

    this.sub = this.teacherDataService.getTeachers().subscribe({
      next: teachers => {
        this.teachers = teachers;
        this.isLoading = teachers.length === 0;
      },
      error: error => {
        this.isLoading = true;
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

    const action = event.detail.data.action;

    if(action === 'cancel') {
      return;
    }





  }
}
