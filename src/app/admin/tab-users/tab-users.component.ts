import { CommonModule } from '@angular/common';

import { Component, OnDestroy, OnInit, inject } from '@angular/core';

import { Functions, httpsCallable } from '@angular/fire/functions';

import {
  IonActionSheet,
  IonAvatar,
  IonBadge,
  IonButton,
  IonButtons,
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
  IonListHeader,
  IonModal,
  IonProgressBar,
  IonRadio,
  IonRadioGroup,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
} from "@ionic/angular/standalone";

import type { OverlayEventDetail } from '@ionic/core/components';
import { Subscription, firstValueFrom } from 'rxjs';
import { UserProfile } from 'src/app/models/user-profile.model';
import { AuthService } from 'src/app/services/auth.service';
import { UserDataService } from 'src/app/services/user-data.service';


/** Estado de la cuenta en Firebase Auth (no vive en Firestore). */
interface AuthStatus {
  emailVerified: boolean;
  disabled: boolean;
}


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
    IonButton,
    IonButtons,
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
    IonListHeader,
    IonModal,
    IonProgressBar,
    IonRadio,
    IonRadioGroup,
    IonSearchbar,
    IonSpinner,
    IonTitle,
    IonToast,
    IonToolbar,
  ]
})

export class TabUsersComponent  implements OnInit, OnDestroy {
  private functions = inject(Functions);
  private userDataService = inject(UserDataService);
  private authService = inject(AuthService);


  users: UserProfile[] = [];
  filteredUsers: UserProfile[] = [];
  authStatus: {[uid: string]: AuthStatus} = {};
  currentUid = '';
  isLoading = true;
  isSpinnerActive = false;
  spinnerText = '';
  isToastOpen = false;
  toastMessage = '';

  searchQuery = '';
  roleFilter = 'todos';

  roleFilters = [
    { value: 'todos', label: 'Todos' },
    { value: 'maestro', label: 'Maestros' },
    { value: 'tutor', label: 'Tutores' },
    { value: 'administrador', label: 'Administradores' },
  ];

  roleOptions = [
    { value: 'maestro', label: 'Maestro' },
    { value: 'tutor', label: 'Tutor' },
    { value: 'administrador', label: 'Administrador' },
  ];

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
  private knownUids = new Set<string>();

  /** Mensaje para la lista vacía, distinguiendo "no hay nadie" de "no hubo match". */
  get emptyMessage(): string {
    if(this.users.length === 0) {
      return 'No hay usuarios registrados aún.';
    }

    const roleName = this.roleFilters.find(filter => filter.value === this.roleFilter)?.label ?? '';
    const search = this.searchQuery.trim();
    const parts = [
      search ? `que coincidan con "${search}"` : '',
      this.roleFilter === 'todos' ? '' : `con rol ${roleName.toLowerCase()}`,
    ]
      .filter(Boolean)
      .join(' y ');

    return parts ? `No se encontraron usuarios ${parts}.` : 'No se encontraron usuarios.';
  }

  ngOnInit() {
    this.sub = this.userDataService.getUsers().subscribe({
      next: users => {
        this.users = users;
        this.isLoading = users.length === 0;
        this.applyFilters();
        this.refreshAuthStatusIfUsersChanged(users);
      },
      error: error => {
        console.error('❌ Schoolify: [tab-users.component.ts]', error);
        this.isLoading = false;
      }
    });

    this.loadAuthStatus();
    this.loadCurrentUid();
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  /** Estado en Auth del usuario, con un valor por defecto mientras carga. */
  statusOf(user: UserProfile): AuthStatus {
    return this.authStatus[user.id ?? user.uid] ?? {emailVerified: true, disabled: false};
  }

  roleLabel(rol?: string): string {
    switch(rol) {
      case 'maestro': return 'Maestro';
      case 'tutor': return 'Tutor';
      case 'administrador': return 'Administrador';
      default: return 'Sin rol';
    }
  }

  onSearchInput(event: Event) {
    const target = event.target as HTMLIonSearchbarElement;
    this.searchQuery = target.value ?? '';
    this.applyFilters();
  }

  setRoleFilter(rol: string) {
    this.roleFilter = rol;
    this.applyFilters();
  }

  isCurrentUser(user: UserProfile): boolean {
    return !!this.currentUid && user.uid === this.currentUid;
  }

  async onChangeRole(user: UserProfile, roleGroup: {value?: string}, modal: IonModal) {
    modal.dismiss();

    const rol = roleGroup?.value;

    if(!user.uid || !rol || rol === user.rol) {
      return;
    }

    if(this.isCurrentUser(user)) {
      this.showToast('⚠️ No puedes cambiar tu propio rol.');
      return;
    }

    await this.updateUser(user, {rol}, `👤 ${user.nombre || user.email} ahora es ${this.roleLabel(rol).toLowerCase()}.`);
  }

  async onToggleDisabled(user: UserProfile) {
    if(!user.uid) {
      return;
    }

    if(this.isCurrentUser(user)) {
      this.showToast('⚠️ No puedes deshabilitar tu propia cuenta.');
      return;
    }

    const disabled = !this.statusOf(user).disabled;

    await this.updateUser(
      user,
      {disabled},
      disabled ? '🚫 Cuenta deshabilitada.' : '✅ Cuenta habilitada.'
    );
  }

  async onDeleteTeacher(event: CustomEvent<OverlayEventDetail>, user: UserProfile) {

    if(!user.uid || !event.detail.data) {
      return;
    }

    const action = event.detail.data.action;

    if(action === 'cancel') {
      return;
    }

    this.isSpinnerActive = true;
    this.spinnerText = 'Eliminando...';

    try {
      const deleteFn = httpsCallable(this.functions, 'deleteTeacher');
      await deleteFn({ uid: user.uid });

    } catch (error) {
      console.error('❌ Schoolify: [tab-users.component.ts]', error);
      this.showToast('❌ Ocurrió un error al eliminar al docente.');

    } finally {
      this.isSpinnerActive = false;
      this.showToast(`🗑️ Se eliminó a ${user.nombre || user.email}`);
    }
  }

  setOpenToast(isOpen: boolean) {
    this.isToastOpen = isOpen;
  }

  /**
   * Aplica la busqueda y el filtro de rol sobre la lista completa. Se hace en
   * memoria: el panel ya carga todos los usuarios en tiempo real.
   */
  private applyFilters() {
    const query = this.normalize(this.searchQuery);

    this.filteredUsers = this.users.filter(user => {
      if(this.roleFilter !== 'todos' && user.rol !== this.roleFilter) {
        return false;
      }

      if(!query) {
        return true;
      }

      const searchable = `${user.nombre ?? ''} ${user.email ?? ''} ${user.celular ?? ''}`;

      return this.normalize(searchable).includes(query);
    });
  }

  /**
   * Minusculas y sin acentos: asi "jose" encuentra "JOSÉ" y al reves. El buscador
   * de estudiantes no normaliza y por eso le pide al usuario probar con y sin acentos.
   */
  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Vuelve a pedir el estado de Auth cuando aparece o desaparece una cuenta.
   *
   * Antes se pedia una sola vez al abrir la pestaña, asi que un usuario que se
   * registraba con el panel abierto se quedaba sin sus distintivos ("Correo sin
   * verificar") hasta recargar o hasta que otra accion forzara la recarga.
   */
  private refreshAuthStatusIfUsersChanged(users: UserProfile[]) {
    const uids = users.map(user => user.id ?? user.uid).filter(Boolean);
    const changed = uids.length !== this.knownUids.size || uids.some(uid => !this.knownUids.has(uid));

    if(!changed) {
      return;
    }

    this.knownUids = new Set(uids);
    this.loadAuthStatus();
  }

  /**
   * El estado de las cuentas (correo verificado, deshabilitada) vive en Auth y no
   * se puede leer desde el cliente: lo devuelve una funcion solo para administradores.
   */
  private async loadAuthStatus() {
    try {
      const statusFn = httpsCallable<unknown, {status: {[uid: string]: AuthStatus}}>(
        this.functions,
        'getUsersAuthStatus'
      );

      const { data } = await statusFn({});
      this.authStatus = data?.status ?? {};

    } catch (error) {
      console.error('❌ Schoolify: [tab-users.component.ts]', error);
    }
  }

  private async loadCurrentUid() {
    const user = await firstValueFrom(this.authService.getCurrentUser());
    this.currentUid = user?.uid ?? '';
  }

  private async updateUser(
    user: UserProfile,
    changes: {rol?: string; disabled?: boolean},
    successMessage: string
  ) {
    this.isSpinnerActive = true;
    this.spinnerText = 'Guardando...';

    try {
      const updateFn = httpsCallable(this.functions, 'updateUserByAdmin');
      await updateFn({uid: user.uid, ...changes});
      this.showToast(successMessage);
      await this.loadAuthStatus();

    } catch (error) {
      console.error('❌ Schoolify: [tab-users.component.ts]', error);
      this.showToast('❌ No se pudo actualizar la cuenta.');

    } finally {
      this.isSpinnerActive = false;
    }
  }

  private showToast(message: string) {
    this.toastMessage = message;
    this.isToastOpen = true;
  }
}
