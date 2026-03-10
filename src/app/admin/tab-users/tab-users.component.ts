import { CommonModule } from '@angular/common';

import {
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';

import { Functions, httpsCallable } from '@angular/fire/functions';

import {
  IonActionSheet,
  IonAvatar,
  IonBadge,
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
  IonSpinner,
  IonTitle,
  IonToast,
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
    IonBadge,
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
    IonSpinner,
    IonTitle,
    IonToast,
    IonToolbar,
  ]
})

export class TabUsersComponent  implements OnInit, OnDestroy {

  teachers: UserProfile[] = [];
  isLoading = true;
  isSpinnerActive = false;
  isToastOpen = false;
  toastMessage = '';

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

  constructor(
    private functions: Functions,
    private teacherDataService: TeacherDataService,
  ) {}

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

  async onDeleteTeacher(event: CustomEvent<OverlayEventDetail>, teacher: UserProfile) {

    if(!teacher.id || !event.detail.data) {
      return;
    }

    const action = event.detail.data.action;

    if(action === 'cancel') {
      return;
    }

    this.isSpinnerActive = true;

    try {
      const deleteFn = httpsCallable(this.functions, 'deleteTeacher');
      await deleteFn({ uid: teacher.uid });

    } catch (error) {
      console.error('❌ Schoolify: [tab-users.component.ts]', error);
      this.showToast('❌ Ocurrió un error al eliminar al docente.');

    } finally {
      this.isSpinnerActive = false;
      this.showToast(`🗑️ Se eliminó a ${teacher.nombre || teacher.email}`);
    }
  }

  setOpenToast(isOpen: boolean) {
    this.isToastOpen = isOpen;
  }

  private showToast(message: string) {
    this.toastMessage = message;
    this.isToastOpen = true;
  }
}
