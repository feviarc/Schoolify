import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { UserProfile } from '../../models/user-profile.model';
import { TeacherDataService } from 'src/app/services/teacher-data.service';

import {
  IonAvatar,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonProgressBar,
  IonToolbar,
  IonTitle, IonChip, IonIcon } from "@ionic/angular/standalone";

@Component({
  selector: 'app-tab-users',
  templateUrl: './tab-users.component.html',
  styleUrls: ['./tab-users.component.scss'],
  standalone: true,
  imports: [IonIcon, IonChip,
    CommonModule,
    IonAvatar,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonProgressBar,
    IonToolbar,
    IonTitle,
  ]
})

export class TabUsersComponent  implements OnInit {

  isLoading: boolean;
  teachers$!: Observable<UserProfile[]>;

  constructor(
    private teacherDataService: TeacherDataService
  ) {
    this.isLoading = true;
  }

  ngOnInit() {
    this.teachers$ = this.teacherDataService.getTeachers();
    this.teachers$.subscribe({
      next: () => {
        this.isLoading = false;
      }
    });
  }
}
