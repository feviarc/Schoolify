import { Component, OnDestroy, OnInit, QueryList, ViewChildren, inject } from '@angular/core';

import {
  IonAccordion,
  IonAccordionGroup,
  IonActionSheet,
  IonButton,
  IonBadge,
  IonButtons,
  IonCheckbox,
  IonChip,
  IonContent,
  IonDatetime,
  IonDatetimeButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonProgressBar,
  IonText,
  IonTextarea,
  IonTitle,
  IonToast,
  IonToggle,
  IonToolbar,
} from "@ionic/angular/standalone";

import { OverlayEventDetail } from '@ionic/core/components';
import { Subscription, firstValueFrom } from 'rxjs';
import { DateFormatPipe } from 'src/app/pipes/date-format.pipe';

import {
  CaregiverNotification,
  CaregiverNotificationsCRUDService,
  NotificationInput,
} from 'src/app/services/caregiver-notifications-crud.service';

import { LocalStorageService } from 'src/app/services/local-storage.service';
import { StudentCRUDService, Student } from 'src/app/services/student-crud.service';
import { StudentGroupCRUDService, StudentGroup } from 'src/app/services/student-group-crud.service';
import { SubjectCRUDService, Subject } from 'src/app/services/subject-crud.service';
import { UserProfileService } from 'src/app/services/user-profile.service';
import { UserProfile } from 'src/app/models/user-profile.model';
import { AuthService } from 'src/app/services/auth.service';


@Component({
  selector: 'app-teacher-tab-notifications',
  templateUrl: './tab-notifications.component.html',
  styleUrls: ['./tab-notifications.component.scss'],
  standalone: true,
  imports: [
    DateFormatPipe,
    IonAccordion,
    IonAccordionGroup,
    IonActionSheet,
    IonButton,
    IonBadge,
    IonButtons,
    IonCheckbox,
    IonChip,
    IonContent,
    IonDatetime,
    IonDatetimeButton,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonListHeader,
    IonModal,
    IonNote,
    IonProgressBar,
    IonText,
    IonTextarea,
    IonTitle,
    IonToast,
    IonToggle,
    IonToolbar,
  ]
})

export class TabNotificationsComponent  implements OnInit, OnDestroy {
  private caregiverNotifCRUDService = inject(CaregiverNotificationsCRUDService);
  private localStorageService = inject(LocalStorageService);
  private studentCRUDService = inject(StudentCRUDService);
  private studentGroupCRUDService = inject(StudentGroupCRUDService);
  private subjectCRUDService = inject(SubjectCRUDService);
  private authService = inject(AuthService);
  private userProfileService = inject(UserProfileService);


  @ViewChildren(IonModal) modals!: QueryList<IonModal>;
  @ViewChildren(IonCheckbox) checkboxes!: QueryList<IonCheckbox>;

  breakpoints = [0, 1];
  cct!: string;
  initialBreakpoint = 1;
  isAbsenceButtonDisabled = false;
  isLoading = false;
  isToastOpen = false;
  selectedDate!: string | null;
  selectedSubjects: string[] = [];
  studentDidntShowUp = true;
  /** Grupos que se pintan: todos para el prefecto, los vinculados para el maestro. */
  studentGroups: StudentGroup[] = [];
  /** Grupos de la escuela completa, antes de aplicar la lista del maestro. */
  private allStudentGroups: StudentGroup[] = [];
  /** `true` cuando el que envia avisos es un maestro (solo ve sus grupos). */
  esMaestro = false;
  private misGrupos: string[] = [];
  studentNotifications: CaregiverNotification[] = [];
  /** Datos del maestro que envia: quedan registrados en cada aviso. */
  private maestroUid = '';
  private maestroNombre = '';

  studentsWithGroup: Student[] = [];
  /** Avisos sin confirmar por alumno (los cuenta una funcion). */
  unconfirmedCounts: {[sid: string]: number} = {};
  /** Materias que se ofrecen en el aviso: el catalogo o el subconjunto del maestro. */
  subjects: Subject[] = [];
  /** Catalogo completo de `materias`; para el maestro se filtra por su lista. */
  private catalogoMaterias: Subject[] = [];
  /** Nombres de las materias que eligio el maestro. */
  private misMaterias: string[] = [];
  teacherComments = '';
  toastMessage = '';
  cctShift!: string;
  private subscriptions: Subscription[] = [];

  private readonly CCT_KEY = this.localStorageService.CCT_KEY;
  private readonly SHIFT_KEY = this.localStorageService.SHIFT_KEY;

  dateFormatOptions = {
    date: {
      weekday: 'short',
      month: 'long',
      day: '2-digit',
      year: 'numeric'
    }
  };

  public actionSheetButtons = [
    {
      text: 'Permitir',
      role: 'accept',
      data: {
        action: 'accept',
      }
    },
    {
      text: 'Rechazar',
      role: 'destructive',
      data: {
        action: 'reject'
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

  isWeekday = (dateString: string) => {
    const date = new Date(dateString);
    const utcDay = date.getUTCDay();
    return utcDay !== 0 && utcDay !== 6;
  };

  ngOnInit() {
    const cct = this.localStorageService.getKey(this.CCT_KEY);
    const shift = this.localStorageService.getKey(this.SHIFT_KEY);
    this.cctShift = `${cct}${shift}`;
    this.isLoading = true;
    this.resetDate();
    this.loadSchoolGroups();
    this.loadStudents();
  }

  /**
   * La pestana se queda viva entre visitas: el perfil se relee aqui (no solo en
   * `ngOnInit`) para que los grupos que el maestro vinculo o quito en la pestana
   * Grupos se reflejen al volver, sin reiniciar la app.
   */
  ionViewWillEnter() {
    this.loadUnconfirmedCounts();
    this.loadMaestro();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  closeModal(triggerId: string | undefined) {
    if(!triggerId) {
      return;
    }

    const modal = this.modals.find(m => m.trigger === triggerId);

    if(!modal) {
      return;
    }

    try {
      modal.dismiss();
    } catch(error) {
      console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
    }
  }

  formatTimestampToISO(timestamp: number) {
    const date = new Date(timestamp);

    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'America/Belize'
    });

    let formattedDate = dateFormatter.format(date);
    formattedDate = formattedDate.replace(', ', 'T').replace(/ /g, '');

    return formattedDate;
  }

  loadSchoolGroups() {
    const sub = this.studentGroupCRUDService.getStudentGroupsByCCT(this.cctShift).subscribe({
      next: groups => {
        this.allStudentGroups = groups;
        this.applyGroupFilter();
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
      }
    });

    this.subscriptions.push(sub);
  }

  loadSubjects() {
    this.subjectCRUDService.getSubjectsSnapshot().subscribe({
      next: (subjects) => {
        this.catalogoMaterias = subjects.map(
          (subject) => ({
            grado: subject.grado,
            id: subject.id,
            nombre: subject.nombre,
          })
        );
        this.buildSubjects();
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
      }
    });
  }

  /**
   * Estado del aviso con el momento en que ocurrió: enviado, visto o enterado.
   * "Enviado" no lleva fecha porque ya se muestra en la columna derecha.
   */
  notificationState(notification: CaregiverNotification): {label: string; color: string; at?: Date} {
    if(notification.acknowledged) {
      return {label: 'Enterado', color: 'success', at: notification.acknowledgedAt};
    }

    if(notification.leido) {
      return {label: 'Visto', color: 'primary', at: notification.leidoAt};
    }

    return {label: 'Enviado', color: 'medium'};
  }

  loadStudentNotifications(student: Student) {
    if(!student.tid || !student.id) {
      return;
    }

    // Se limpia antes de consultar: asi no se ve el historial del alumno anterior
    // mientras llega la respuesta.
    this.studentNotifications = [];

    this.caregiverNotifCRUDService.getNotificationsByStudentIdSnapshot(student.tid, student.id).subscribe({
      next: (notifications) => {
        this.studentNotifications = notifications;
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
        this.showToast('🛑 No se pudo cargar el historial.');
      }
    });
  }

  /** Cuantos avisos sin confirmar tiene un alumno. */
  unconfirmedCount(student: Student): number {
    return student.id ? this.unconfirmedCounts[student.id] ?? 0 : 0;
  }

  loadStudents() {
    const sub = this.studentCRUDService.getStudentsWithGroupByCCT(this.cctShift).subscribe({
      next: (students) => {
        students.sort(
          (a, b) => {
            if(!a.gid || !b.gid) {
              return 0;
            }
            return a.gid.localeCompare(b.gid);
          }
        );

        this.studentsWithGroup = students;
        this.isLoading = false;
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
      }
    });

    this.subscriptions.push(sub);
  }

  async onAddAbsence(student: Student) {
    this.closeModal('absence-' + student.id);

    if(!student.id || !student.tid) {
      return;
    }

    const notification: NotificationInput = {
      sid: student.id,
      nombreCompleto: student.nombreCompleto,
      tipo: 'Inasistencia',
      fecha: this.selectedDate || undefined,
      observaciones: this.teacherComments,
      materias: this.selectedSubjects,
      maestroUid: this.maestroUid,
      maestroNombre: this.maestroNombre,
    };

    await this.sendNotification(
      student.tid,
      notification,
      '📤 Se ha enviado la notificación de inasistencia.'
    );
  }

  async onAddNoncompliance(student: Student) {
    this.closeModal('noncompliance-' + student.id);

    if(!student.id || !student.tid) {
      return;
    }

    const notification: NotificationInput = {
      sid: student.id,
      tipo: 'Incumplimiento',
      nombreCompleto: student.nombreCompleto,
      observaciones: this.teacherComments,
      materias: this.selectedSubjects,
      maestroUid: this.maestroUid,
      maestroNombre: this.maestroNombre,
    };
    await this.sendNotification(
      student.tid,
      notification,
      '📤 Se ha enviado la notificación de incumplimiento.'
    );
  }

  async onAddMisconduct(student: Student) {
    this.closeModal('misconduct-' + student.id);

    if(!student.id || !student.tid) {
      return;
    }

    const notification: NotificationInput = {
      sid: student.id,
      tipo: 'Indisciplina',
      nombreCompleto: student.nombreCompleto,
      observaciones: this.teacherComments,
      materias: this.selectedSubjects,
      maestroUid: this.maestroUid,
      maestroNombre: this.maestroNombre,
    };

    await this.sendNotification(
      student.tid,
      notification,
      '📤 Se ha enviado la notificación de indisciplina.'
    );
  }

  onCommentsChange(event: CustomEvent) {
    this.teacherComments = event.detail.value;
  }

  /**
   * El maestro solo reporta inasistencia parcial: al abrir el modal se apaga el
   * modo "No asistió a la escuela" y el envío queda bloqueado hasta elegir materias.
   */
  onAbsenceModalWillPresent() {
    if(!this.esMaestro) {
      return;
    }

    this.studentDidntShowUp = false;
    this.isAbsenceButtonDisabled = true;
  }

  async onModalDismiss(slidingItem: IonItemSliding) {
    await slidingItem.close();

    this.resetDate();
    this.isAbsenceButtonDisabled = false;
    this.studentDidntShowUp = true;

    this.teacherComments = '';
    this.selectedSubjects = [];

    this.subjects.forEach(s => s.selected = false);
  }

  onDatetimePickerChange(event: CustomEvent) {
    this.selectedDate = event.detail.value;
  }

  onSubjectChange(subject: any) {
    subject.selected = !subject.selected;

    this.selectedSubjects = this.subjects
    .filter(m => m.selected)
    .map(m => m.nombre);

    if(!this.studentDidntShowUp) {
      if(this.selectedSubjects.length > 0) {
        this.isAbsenceButtonDisabled = false;
      } else {
        this.isAbsenceButtonDisabled = true;
      }
    }
  }

  onStudentDidntShowUpChange() {
    this.studentDidntShowUp = !this.studentDidntShowUp;

    if(!this.studentDidntShowUp && this.selectedSubjects.length === 0) {
      this.isAbsenceButtonDisabled = true;
    }

    if(this.studentDidntShowUp) {
      this.isAbsenceButtonDisabled = false;
      this.selectedSubjects = [];
      this.subjects.forEach(s => s.selected = false);
      this.checkboxes.forEach(c => c.checked = false);
    }
  }

  async onValidate(event: CustomEvent<OverlayEventDetail>, studentId: string) {
    const eventButton = event.detail.data;

    if(!eventButton || eventButton.action === 'cancel') {
      return;
    }

    if(eventButton.action === 'reject') {
      await this.studentCRUDService.removeTutor(studentId);
    } else {
      await this.studentCRUDService.validateStudentNotifications(studentId, true);
    }
  }

  resetDate() {
    this.selectedDate = this.formatTimestampToISO(Date.now());
  }

  studentsListByGroup(groupGid: string) {
    const students = this.studentsWithGroup.filter(
      (student) => student.gid === groupGid
    );

    students.sort(
      (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto)
    );

    return students;
  }

  subjectsByGrade(grade: string) {
    return this.subjects.filter(
      (subject) => subject.grado === grade
    );
  }

  /** Avisos sin confirmar de la escuela, en una sola llamada a una funcion. */
  private async loadUnconfirmedCounts() {
    if(!this.cctShift) {
      return;
    }

    try {
      this.unconfirmedCounts = await this.caregiverNotifCRUDService.getUnconfirmedCounts();
    } catch(error) {
      console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
    }
  }

  /**
   * Nombre con el que se firma el aviso (el uid ya viene de la sesión), rol del
   * que envia (el maestro solo trabaja con lo que vinculo) y sus materias.
   */
  private async loadMaestro() {
    try {
      const user = await firstValueFrom(this.authService.getCurrentUser());
      this.maestroUid = user?.uid ?? '';

      if(!this.maestroUid) {
        return;
      }

      // `forceRefresh`: el perfil cacheado puede traer grupos viejos.
      const profile = await firstValueFrom(this.userProfileService.getUserProfile(this.maestroUid, true));
      this.maestroNombre = profile?.nombre ?? '';
      this.esMaestro = profile?.rol === 'maestro';
      this.misGrupos = profile?.grupos ?? [];

      this.applyGroupFilter();
      this.applySubjects(profile);
    } catch(error) {
      console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
    }
  }

  /** El maestro solo ve los grupos de su lista; el prefecto, todos los de la escuela. */
  private applyGroupFilter() {
    this.studentGroups = this.esMaestro
      ? this.allStudentGroups.filter(group => this.misGrupos.includes(group.gid))
      : this.allStudentGroups;
  }

  /**
   * Materias del selector: el prefecto usa el catalogo completo; el maestro, el
   * subconjunto que eligio en su perfil (`usuarios/{uid}.materias`). En ambos
   * casos se filtra por el grado del grupo.
   */
  private applySubjects(profile: UserProfile | null) {
    this.misMaterias = profile?.materias ?? [];

    if(this.catalogoMaterias.length === 0) {
      this.loadSubjects();
      return;
    }

    this.buildSubjects();
  }

  private buildSubjects() {
    const source = this.esMaestro
      ? this.catalogoMaterias.filter(materia => this.misMaterias.includes(materia.nombre))
      : this.catalogoMaterias;

    this.subjects = source.map(materia => ({
      grado: materia.grado,
      id: materia.id,
      nombre: materia.nombre,
      selected: false,
    }));
  }

  /** Envía el aviso y avisa del resultado; el modal ya se cerró antes de escribir. */
  private async sendNotification(
    tid: string,
    notification: NotificationInput,
    successMessage: string
  ) {
    try {
      await this.caregiverNotifCRUDService.addNotification(tid, notification);
      this.showToast(successMessage);
    } catch(error) {
      console.log('❌ Schoolify: [tab-notifications.component.ts]', error);
      this.showToast('🛑 No se pudo enviar la notificación.');
    }
  }

  private showToast(message: string) {
    this.toastMessage = message;
    this.isToastOpen = true;
  }

}
