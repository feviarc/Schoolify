import { Component, OnDestroy, OnInit, inject } from '@angular/core';

import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonNote,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';

import { Subscription, firstValueFrom } from 'rxjs';

import { AuthService } from 'src/app/services/auth.service';
import { UserProfileService } from 'src/app/services/user-profile.service';
import { StudentGroup, StudentGroupCRUDService } from 'src/app/services/student-group-crud.service';
import { Subject, SubjectCRUDService } from 'src/app/services/subject-crud.service';
import {
  AcademicOutcomesService,
  AccreditationStudent,
} from 'src/app/services/academic-outcomes.service';
import { SchoolConfigService } from 'src/app/services/school-config.service';

/**
 * Acreditacion por materia del ciclo. El maestro elige uno de sus grupos y una
 * de sus materias, marca a cada alumno y guarda en lote.
 */
@Component({
  selector: 'app-tab-accreditations',
  templateUrl: './tab-accreditations.component.html',
  styleUrls: ['./tab-accreditations.component.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonNote,
    IonProgressBar,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToast,
    IonToolbar,
  ]
})
export class TabAccreditationsComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private userProfileService = inject(UserProfileService);
  private groupService = inject(StudentGroupCRUDService);
  private subjectService = inject(SubjectCRUDService);
  private outcomesService = inject(AcademicOutcomesService);
  private configService = inject(SchoolConfigService);

  ciclo = '2026-2027';
  grupos: StudentGroup[] = [];
  materias: Subject[] = [];
  selectedGid = '';
  selectedSubjectId = '';
  students: AccreditationStudent[] = [];
  /** Estatus por alumno: acreditado, no_acreditado o sin_registrar. */
  estatus: {[sid: string]: string} = {};

  isLoading = true;
  isSaving = false;
  isToastOpen = false;
  toastMessage = '';

  private loadKey = '';
  private subscriptions: Subscription[] = [];

  async ngOnInit() {
    this.ciclo = await this.configService.getCiclo();

    const user = await firstValueFrom(this.authService.getCurrentUser());
    const uid = user?.uid ?? '';

    if(!uid) {
      this.isLoading = false;
      return;
    }

    const profile = await firstValueFrom(this.userProfileService.getUserProfile(uid, true));
    const cct = profile?.cct ?? '';
    const misGrupos = profile?.grupos ?? [];
    const misMaterias = profile?.materias ?? [];

    if(!cct) {
      this.isLoading = false;
      return;
    }

    const groupsSub = this.groupService.getStudentGroupsByCCT(cct).subscribe({
      next: groups => {
        this.grupos = groups
          .filter(group => misGrupos.includes(group.gid))
          .sort((a, b) => `${a.grado}${a.letra}`.localeCompare(`${b.grado}${b.letra}`));

        if(!this.selectedGid && this.grupos.length > 0) {
          this.selectedGid = this.grupos[0].gid;
        }

        this.maybeLoad();
      },
      error: error => {
        console.log('❌ Schoolify: [tab-accreditations] grupos', error);
        this.isLoading = false;
      }
    });

    const subjectsSub = this.subjectService.subjects$.subscribe(subjects => {
      this.materias = subjects
        .filter(subject => misMaterias.includes(subject.nombre))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      if(!this.selectedSubjectId && this.materias.length > 0) {
        this.selectedSubjectId = this.materias[0].id ?? '';
      }

      this.maybeLoad();
    });

    this.subscriptions.push(groupsSub, subjectsSub);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  onGroupChange(event: CustomEvent) {
    this.selectedGid = event.detail.value;
    this.loadKey = '';
    this.maybeLoad();
  }

  onSubjectChange(event: CustomEvent) {
    this.selectedSubjectId = event.detail.value;
    this.loadKey = '';
    this.maybeLoad();
  }

  onEstatusChange(studentId: string, event: CustomEvent) {
    this.estatus[studentId] = event.detail.value;
  }

  async save() {
    if(!this.selectedGid || !this.selectedSubjectId || this.students.length === 0) {
      return;
    }

    this.isSaving = true;

    try {
      const entries = this.students.map(student => ({
        sid: student.id,
        estatus: this.estatus[student.id] ?? 'sin_registrar',
      }));

      await this.outcomesService.saveAccreditations(
        this.selectedGid,
        this.selectedSubjectId,
        this.ciclo,
        entries
      );

      this.showToast('✅ Acreditación guardada.');
      await this.loadAccreditations();
    } catch(error) {
      console.log('❌ Schoolify: [tab-accreditations] guardar', error);
      this.showToast('🛑 No se pudo guardar la acreditación.');
    } finally {
      this.isSaving = false;
    }
  }

  private maybeLoad() {
    const key = `${this.selectedGid}|${this.selectedSubjectId}`;

    if(!this.selectedGid || !this.selectedSubjectId || key === this.loadKey) {
      return;
    }

    this.loadKey = key;
    void this.loadAccreditations();
  }

  private async loadAccreditations() {
    this.isLoading = true;

    try {
      const {students, records} = await this.outcomesService.getAccreditations(
        this.selectedGid,
        this.selectedSubjectId,
        this.ciclo
      );

      this.students = students;
      this.estatus = {};
      students.forEach(student => {
        this.estatus[student.id] = records[student.id] ?? 'sin_registrar';
      });
    } catch(error) {
      console.log('❌ Schoolify: [tab-accreditations] cargar', error);
      this.showToast('🛑 No se pudieron cargar los alumnos.');
    } finally {
      this.isLoading = false;
    }
  }

  private showToast(message: string) {
    this.toastMessage = message;
    this.isToastOpen = true;
  }
}
