/* eslint-disable @angular-eslint/prefer-inject */

import {
  Component,
  OnInit,
  ViewChild, OnDestroy,
} from '@angular/core';

import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemSliding,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonProgressBar,
  IonRadio,
  IonRadioGroup,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";

import { User } from 'firebase/auth'
import { firstValueFrom, Subscription } from 'rxjs';
import { UserProfile } from 'src/app/models/user-profile.model';
import { AuthService } from 'src/app/services/auth.service';
import { LocalStorageService } from 'src/app/services/local-storage.service';
import { StudentCRUDService, Student } from 'src/app/services/student-crud.service';
import { UserProfileService } from 'src/app/services/user-profile.service';


@Component({
  selector: 'app-tab-students',
  templateUrl: './tab-students.component.html',
  styleUrls: ['./tab-students.component.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonFab,
    IonFabButton,
    IonFooter,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemSliding,
    IonLabel,
    IonList,
    IonModal,
    IonNote,
    IonProgressBar,
    IonRadio,
    IonRadioGroup,
    IonSearchbar,
    IonTitle,
    IonToolbar,
  ]
})

export class TabStudentsComponent  implements OnInit, OnDestroy {

  @ViewChild(IonSearchbar) searchbar!: IonSearchbar;

  cctShift!: string;
  selectedStudent: any;
  tid?: string;
  uid?: string;
  tabMessage = '';

  isLoading = true;

  filteredStudentsWithoutTutor: Student[] = [];
  profile: UserProfile | null = null;
  studentsByTutor: Student[] = [];
  studentsWithoutTutor: Student[] = [];
  subscriptions: Subscription[] = [];
  user: User | null = null;

  private readonly CCT_KEY = this.localStorage.CCT_KEY;
  private readonly SHIFT_KEY = this.localStorage.SHIFT_KEY;

  constructor(
    private authService: AuthService,
    private localStorage: LocalStorageService,
    private studentCRUDService: StudentCRUDService,
    private userProfileService: UserProfileService,
  ) { }

  async ngOnInit() {
    const cct = this.localStorage.getKey(this.CCT_KEY);
    const shift = this.localStorage.getKey(this.SHIFT_KEY);
    this.cctShift = `${cct}${shift}`;
    await this.getCurrentUser();
    await this.getUserProfile();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async getCurrentUser() {
    try {
      this.user = await firstValueFrom(this.authService.getCurrentUser());
      this.tid = this.user?.uid;

      if (this.tid) {
        this.loadStudentsByTutor(this.tid);
      }
    } catch(error) {
      console.log('❌ Schoolify: [tab-students.component.ts]', error);
    }
  }

  async getUserProfile() {
    if (!this.user) {
      return;
    }
    try {
      this.profile = await firstValueFrom(this.userProfileService.getUserProfile(this.tid!));
    } catch(error) {
      console.log('❌ Schoolify: [tab-students.component.ts]', error);
    }
  }

  handleInputSearchbar(event: CustomEvent) {
    const target = event.target as HTMLIonSearchbarElement;
    const query = target.value?.toUpperCase() || '';

    this.filteredStudentsWithoutTutor = this.studentsWithoutTutor.filter(
      (student) => student.nombreCompleto.includes(query)
    );

    if(this.filteredStudentsWithoutTutor.length === 0) {
      this.tabMessage = `No se encontraron alumnos con la frase "${query}". Puedes intentar buscar colocando o quitando acentos en tu búsqueda.`;
    }
  }

  loadStudentsByTutor(id: string) {
    const sub = this.studentCRUDService.getStudentsByTutor(id).subscribe({
      next: (students) => {
        students.sort(
            (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto)
        );
        this.studentsByTutor = students;
        this.isLoading = false;
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-students.component.ts]', error);
      }
    });

    this.subscriptions.push(sub);
  }

  loadStudentsWithoutTutor(cct: string) {
    if(!cct) {
      return;
    }

    const sub = this.studentCRUDService.getStudentsWithoutTutorByCCT(cct).subscribe({
      next: (students) => {
        students.sort(
            (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto)
        );
        this.studentsWithoutTutor = students;
        this.filteredStudentsWithoutTutor = [...students];
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-students.component.ts]', error);
      }
    });

    this.subscriptions.push(sub);
  }

  async onAssingTutor() {
    const studenId = this.selectedStudent.id;
    const tutorId = this.tid ?? '';
    const tutorName = this.profile?.nombre ?? '';

    this.searchbar.value = '';
    this.selectedStudent = null;
    await this.studentCRUDService.assignTutor(studenId, tutorId, tutorName);
  }

  selectStudentCompareWith(s1: Student, s2: Student): boolean {
    return s1.id === s2.id;
  }

  selectStudentHandleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.selectedStudent = target.value;
  }
}
