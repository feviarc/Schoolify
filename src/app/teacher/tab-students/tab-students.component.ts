import {
  Component,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';

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
  IonToolbar,
} from "@ionic/angular/standalone";

import { OverlayEventDetail } from '@ionic/core';
import { Subscription } from 'rxjs';
import { StudentCRUDService, Student } from 'src/app/services/student-crud.service';
import { CctStorageService } from 'src/app/services/cct-storage.service';


@Component({
  selector: 'app-teacher-tab-students',
  templateUrl: './tab-students.component.html',
  styleUrls: ['./tab-students.component.scss'],
  standalone: true,
  imports: [
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

  @ViewChild(IonSearchbar) searchbar!: IonSearchbar;
  @ViewChildren(IonModal) modals!: QueryList<IonModal>;

  breakpoints = [0, 0.20, 0.40, 0.50, 0.80, 1];
  cct!: string;
  filteredStudents: Student[] = [];
  formSnapshot: any;
  initialBreakpoint = 0.50;
  isFirstEmission = true;
  isLoading = true;
  isSaving = false;
  isSpinnerActive = false;
  isToastOpen = false;
  isUpdateButtonDisable = true;
  spinnerText = '';
  students: Student[] = [];
  tabMessage = 'No hay alumnos registrados todavía.';
  toastMessage = '';
  private subscriptions: Subscription[] = [];

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

  constructor(
    private cctStorageService: CctStorageService,
    private formBuilder: FormBuilder,
    private studentCRUDService: StudentCRUDService,
  ) {}

  ngOnInit() {
    const cct = this.cctStorageService.getCCT();
    this.cct = (cct !== null ? cct : '');
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

  isSameStudentData() {
    return JSON.stringify(this.formSnapshot) === JSON.stringify(this.form.value);
  }

  handleInput(event: Event) {
    const target = event.target as HTMLIonSearchbarElement;
    const query = target.value?.toUpperCase() || '';
    this.filteredStudents = this.students.filter(
      (student) => student.nombreCompleto.includes(query)
    );

    if(this.filteredStudents.length === 0) {
      this.tabMessage = `No se encontraron alumnos con la frase "${query}". Puedes intentar buscar colocando o quitando acentos en tu búsqueda.`;
    }
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
        this.filteredStudents = [...this.students];

        if(this.isFirstEmission) {
          this.isFirstEmission = false;
          this.isLoading = false;
        }

        if(this.searchbar) {
          this.searchbar.value = '';
        }
      },
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-students.components.ts]', error);
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
      console.log('❌ Escuela-MX: [tab-students.component.ts]', error);
    }

    this.isSpinnerActive = false;
    this.isSaving = false;
  }

  async onDeleteStudent(event: CustomEvent<OverlayEventDetail>, slidingItem: IonItemSliding, student: Student) {
    slidingItem.close();

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
      console.log('❌ Escuela-MX: [tab-students.component.ts]', error);
    }

    this.isSpinnerActive = false;
    this.isSaving = false;
  }

  private showToast(message: string) {
    this.toastMessage = message;
    this.isToastOpen = true;
  }
}
