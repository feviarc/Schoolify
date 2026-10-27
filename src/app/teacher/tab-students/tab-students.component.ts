import { Component, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, inject } from '@angular/core';

import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import {
  IonActionSheet,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
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
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar, IonBadge } from "@ionic/angular/standalone";

import { OverlayEventDetail } from '@ionic/core';
import { Subscription } from 'rxjs';
import { LocalStorageService } from 'src/app/services/local-storage.service';
import { StudentCRUDService, Student } from 'src/app/services/student-crud.service';


@Component({
  selector: 'app-teacher-tab-students',
  templateUrl: './tab-students.component.html',
  styleUrls: ['./tab-students.component.scss'],
  standalone: true,
  imports: [IonBadge,
    FormsModule,
    IonActionSheet,
    IonButton,
    IonButtons,
    IonChip,
    IonContent,
    IonFab,
    IonFabButton,
    IonHeader,
    IonIcon,
    IonInput,
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
    IonSearchbar,
    IonSpinner,
    IonTitle,
    IonToast,
    IonToolbar,
    ReactiveFormsModule,
  ]
})

export class TabStudentsComponent  implements OnInit, OnDestroy {
  private localStorageService = inject(LocalStorageService);
  private formBuilder = inject(FormBuilder);
  private studentCRUDService = inject(StudentCRUDService);


  @ViewChild(IonSearchbar) searchbar!: IonSearchbar;
  @ViewChildren(IonModal) modals!: QueryList<IonModal>;

  breakpoints = [0, 1];
  cct!: string;
  filteredStudents: Student[] = [];
  formSnapshot: any;
  initialBreakpoint = 1;
  isFirstEmission = true;
  isLoading = true;
  isSaving = false;
  isSpinnerActive = false;
  isToastOpen = false;
  isUpdateButtonDisable = true;
  spinnerText = '';
  students: Student[] = [];
  toastMessage = '';

  searchQuery = '';
  groupFilter = 'todos';

  groupFilters = [
    { value: 'todos', label: 'Todos' },
    { value: 'con', label: 'Con grupo' },
    { value: 'sin', label: 'Sin grupo' },
  ];

  tutorFilter = 'todos';

  tutorFilters = [
    { value: 'todos', label: 'Todos' },
    { value: 'con', label: 'Con tutor' },
    { value: 'sin', label: 'Sin tutor' },
  ];

  private subscriptions: Subscription[] = [];
  private readonly CCT_KEY = this.localStorageService.CCT_KEY;
  private readonly SHIFT_KEY = this.localStorageService.SHIFT_KEY;

  public actionSheetButtons = [
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

  form = this.formBuilder.group({
    nombre: ['',[
      Validators.required,
      Validators.pattern('^[A-Za-zÑñÁÉÍÓÚáéíóú ]+$')
    ]],
    apellidoPaterno: ['',[
      Validators.required,
      Validators.pattern('^[A-Za-zÑñÁÉÍÓÚáéíóú ]+$')
    ]],
    apellidoMaterno: ['',[
      Validators.pattern('^[A-Za-zÑñÁÉÍÓÚáéíóú ]+$')
    ]]
  });

  /** Mensaje de lista vacia, distinguiendo "no hay nadie" de "no hubo match". */
  get emptyMessage(): string {
    if(this.students.length === 0) {
      return 'No hay alumnos registrados todavía.';
    }

    const conditions: string[] = [];
    const search = this.searchQuery.trim();

    if(search) {
      conditions.push(`que coincidan con "${search}"`);
    }

    const groupLabel = this.groupFilters.find(filter => filter.value === this.groupFilter)?.label ?? '';
    const tutorLabel = this.tutorFilters.find(filter => filter.value === this.tutorFilter)?.label ?? '';

    if(this.groupFilter !== 'todos') {
      conditions.push(`con "${groupLabel.toLowerCase()}"`);
    }

    if(this.tutorFilter !== 'todos') {
      conditions.push(`con "${tutorLabel.toLowerCase()}"`);
    }

    return conditions.length ? `No se encontraron alumnos ${conditions.join(' y ')}.` : 'No se encontraron alumnos.';
  }

  ngOnInit() {
    const cct = this.localStorageService.getKey(this.CCT_KEY);
    const shift = this.localStorageService.getKey(this.SHIFT_KEY);
    this.cct = `${cct}${shift}`;
    this.loadStudents();
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

    modal.dismiss();
    this.form.reset();
  }

  generateFullName() {
    const apellidoPaterno = this.form.get('apellidoPaterno')?.value?.trim().toUpperCase() ?? '';
    const apellidoMaterno = this.form.get('apellidoMaterno')?.value?.trim().toUpperCase() ?? '';
    const nombre = this.form.get('nombre')?.value?.trim().toUpperCase() ?? '';
    let nombreCompleto;

    if(apellidoMaterno) {
      nombreCompleto = `${apellidoPaterno} ${apellidoMaterno} ${nombre}`.trim().toUpperCase();
    } else {
      nombreCompleto =  `${apellidoPaterno} ${nombre}`.trim().toUpperCase();
    }

    return {nombre, apellidoPaterno, apellidoMaterno, nombreCompleto};
  }

  getGroupFromSID(sid: string) {
    const index = sid.indexOf('_') + 1;
    return sid.substring(index);
  }

  isSameStudentData() {
    return JSON.stringify(this.formSnapshot) === JSON.stringify(this.form.value);
  }

  onSearchInput(event: Event) {
    const target = event.target as HTMLIonSearchbarElement;
    this.searchQuery = target.value ?? '';
    this.applyFilters();
  }

  setGroupFilter(value: string) {
    this.groupFilter = value;
    this.applyFilters();
  }

  setTutorFilter(value: string) {
    this.tutorFilter = value;
    this.applyFilters();
  }

  loadStudentData(student: Student) {
    const studentFields = {
      nombre: student.nombre,
      apellidoPaterno: student.apellidoPaterno,
      apellidoMaterno: student.apellidoMaterno,
    };

    this.form.patchValue(studentFields);
    this.formSnapshot = {...studentFields};
  }

  loadStudents() {
    const sub = this.studentCRUDService.getStudentsByCCT(this.cct).subscribe({
      next: students => {
        students.sort(
          (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto)
        );
        this.students = students;
        this.applyFilters();

        if(this.isFirstEmission) {
          this.isFirstEmission = false;
          this.isLoading = false;
        }

        if(this.searchbar) {
          this.searchbar.value = '';
          this.searchQuery = '';
          this.applyFilters();
        }
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-students.components.ts]', error);
      }
    });

    this.subscriptions.push(sub);
  }

  async onAddStudent() {
    this.spinnerText = 'Guardando...';
    this.isSpinnerActive = true;
    this.isSaving = true;

    const studentData = {
      ...this.generateFullName(),
      cct: this.cct,
    };

    try {
      this.closeModal('add-student-btn');
      const studentId = await this.studentCRUDService.addStudent(studentData);
    } catch (error) {
      console.log('❌ Schoolify: [tab-students.component.ts]', error);
    }

    this.isSpinnerActive = false;
    this.isSaving = false;
  }

  async onDeleteStudent(event: CustomEvent<OverlayEventDetail>, student: Student) {
    if(!event.detail.data || !student.id) {
      return;
    }

    const action = event.detail.data.action;

    if(action === 'cancel') {
      return;
    }

    if(student.gid) {
      this.showToast('⚠️ Primero debes eliminar al estudiante de su grupo.');
      return;
    }

    this.spinnerText = 'Eliminando...';
    this.isSpinnerActive = true;
    await this.studentCRUDService.deleteStudent(student.id);
    this.isSpinnerActive = false;
    this.showToast(`🗑️ Se eliminó a ${student.nombreCompleto}`);
  }

  async onModalDismiss(slidingItem: IonItemSliding) {
    await slidingItem.close();
    this.form.reset();
  }

  async onRemoveTutor(studentId: string) {
    await this.studentCRUDService.validateStudentNotifications(studentId, false);
    await this.studentCRUDService.removeTutor(studentId);
  }

  async onUpdateStudent(student: Student) {
    if(!student.id){
      return;
    }

    this.spinnerText = 'Actualizando...';
    this.isSpinnerActive = true;
    this.isSaving = true;
    const modifiedStudentName = this.generateFullName();

    try {
      this.closeModal('update-' + student.id);
      await this.studentCRUDService.updateStudent(student.id, modifiedStudentName);
    } catch(error) {
      console.log('❌ Schoolify: [tab-students.component.ts]', error);
    }

    this.isSpinnerActive = false;
    this.isSaving = false;
  }

  /** Aplica buscador (nombre o grupo) y chips (con/sin grupo) juntos. */
  private applyFilters() {
    const query = this.normalize(this.searchQuery);

    this.filteredStudents = this.students.filter(student => {
      const hasGroup = !!student.gid;
      // "Con tutor" = tutor autorizado por el maestro, no solo reclamado.
      const hasTutor = !!student.validado;

      if(this.groupFilter === 'con' && !hasGroup) {
        return false;
      }

      if(this.groupFilter === 'sin' && hasGroup) {
        return false;
      }

      if(this.tutorFilter === 'con' && !hasTutor) {
        return false;
      }

      if(this.tutorFilter === 'sin' && hasTutor) {
        return false;
      }

      if(!query) {
        return true;
      }

      const grupo = hasGroup ? this.getGroupFromSID(student.gid as string) : '';
      const searchable = `${student.nombreCompleto} ${grupo}`;

      return this.normalize(searchable).includes(query);
    });
  }

  /**
   * Minusculas y sin acentos: asi "jose" encuentra "JOSÉ" y al reves, y ya no hace
   * falta pedirle al usuario que pruebe con y sin acentos.
   */
  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  private showToast(message: string) {
    this.toastMessage = message;
    this.isToastOpen = true;
  }
}
