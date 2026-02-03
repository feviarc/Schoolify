import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';
import {
  AlertController,
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonInputPasswordToggle,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonText,
  IonTitle,
  IonToast,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { User } from 'firebase/auth';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { LoadingService } from '../services/loading-service';
import { NotificationService } from '../services/notification.service';
import { UserProfileService } from '../services/user-profile.service';


@Component({
  selector: 'app-auth',
  templateUrl: './auth.page.html',
  styleUrls: ['./auth.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonButton,
    IonContent,
    IonHeader,
    IonInput,
    IonInputPasswordToggle,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonText,
    IonTitle,
    IonToast,
    IonToggle,
    IonToolbar,
  ]
})

export class AuthPage implements OnInit {

  authForm!: FormGroup;
  emailVerificationMessage: string | null = null;
  resetPasswordMessage: string | null = null;
  toastMessage: string | null = null;
  isLoginMode = true;
  isResetPasswordMode = false;
  isToastOpen = false;

  private messages = {
    invalidCredential: '🛑  Usuario o contraseña incorrectos.',
    emailAlreadyInUse: '🛑  Este correo ya está registrado.',
    passwordReset: '✅  Se envió un correo de restablecimiento de contraseña.',
    emailVerification: '✅  Se envió un correo de verificación. Revisa tu bandeja de entrada o Spam.',
    emailNotVerified: '⚠️  Tu correo electrónico aún no ha sido verificado. Revisa tu bandeja de entrada o la carpeta de Spam y haz clic en el enlace de verificación para activar tu cuenta.',
    default: '🛑  Ocurrió un error. Inténtalo nuevamente.'
  };

  constructor(
    private alertController: AlertController,
    private authService: AuthService,
    private formBuilder: FormBuilder,
    private loadingService: LoadingService,
    private notificationService: NotificationService,
    private router: Router,
    private userProfileService: UserProfileService
  ) { }

  async ngOnInit() {
    this.authForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });
    await this.checkUserStatus();
  }

  private async checkUserStatus() {
    try {
      const user = await firstValueFrom(this.authService.getCurrentUser());

      if(user) {
        this.handleLoginRedirect(user);
      }
    } catch(error) {
      console.error('❌ Escuela-MX: [auth.page.ts]', error)
    }
  }

  async onSubmit() {

    if (!this.authForm.valid) {
      return;
    }

    await this.loadingService.present();

    let role;
    const isFirstUser = await this.userProfileService.isFirstUser();
    const { email, password, isTutor } = this.authForm.value;

    try {
      if(this.isLoginMode) {
        await this.loadingService.updateMessage('Iniciando Sesión...');
        const userCredential = await firstValueFrom(this.authService.login(email, password));
        this.handleLoginRedirect(userCredential.user);

      } else if(this.isResetPasswordMode) {
        await this.loadingService.updateMessage('Enviado email...');
        await firstValueFrom(this.authService.resetPassword(email));
        await this.loadingService.dismiss();
        this.toastMessage = this.messages.passwordReset;
        this.setOpenToast(true);
        this.isResetPasswordMode = false;
        this.isLoginMode = true;

      } else {

        if(isTutor){
          role = 'tutor';
        } else if(isFirstUser) {
          role = 'administrador';
        } else {
          role = 'maestro';
        }

        await this.loadingService.updateMessage(`Registrando ${role}...`);
        const user = await this.authService.register(email, password, role);
        await this.loadingService.dismiss();
        this.emailVerificationMessage = this.messages.emailVerification;
        this.isLoginMode = true;
      }

    } catch(error: any) {
      this.loadingService.dismiss();
      switch(error.code) {
        case 'auth/invalid-credential':
          this.toastMessage = this.messages.invalidCredential;
          break;
        case 'auth/email-already-in-use':
          this.toastMessage = this.messages.emailAlreadyInUse;
          break;
        default:
          this.toastMessage = this.messages.default;
      }
      this.setOpenToast(true);
    }
     this.authForm.reset();
  }

  async onResendVerificationEmail() {
    this.emailVerificationMessage = null;
    try{
      await this.authService.resendVerificationEmail();
      this.toastMessage = this.messages.emailVerification;
    } catch(error) {
      this.toastMessage = this.messages.default;
    }
    this.setOpenToast(true);
  }

  onSwitchMode() {
    this.isLoginMode = !this.isLoginMode;
    this.isResetPasswordMode = false;
    this.emailVerificationMessage = null;
    this.updateFormControls();
  }

  onSwitchToResetPassword() {
    this.isResetPasswordMode = true;
    this.isLoginMode = false;
    this.emailVerificationMessage = null;
    this.authForm.get('password')?.setValidators(null);
    this.authForm.get('password')?.updateValueAndValidity();
  }

  setOpenToast(openStatus: boolean) {
    this.isToastOpen = openStatus;
  }

  private async handleLoginRedirect(user: User) {

    if(!user) {
      this.router.navigateByUrl('/auth');
      return;
    }

    if(!user.emailVerified) {
      this.emailVerificationMessage = this.messages.emailNotVerified;
      return;
    }

    try {
      const userProfile = await firstValueFrom(this.userProfileService.getUserProfile(user.uid));

      if(userProfile) {

        await this.requestNotificationsAfterLogin();

        switch(userProfile.rol) {
          case 'administrador':
            this.router.navigateByUrl('/admin-dashboard');
            break;
          case 'maestro':
            this.router.navigateByUrl('/teacher-dashboard');
            break;
          case 'tutor':
            this.router.navigateByUrl('/caregiver-dashboard');
            break;
          default:
            this.router.navigateByUrl('/auth');
        }
      } else {
          await firstValueFrom(this.authService.logout());
          this.router.navigateByUrl('/auth');
      }
    } catch(error) {
      console.log('❌ Escuela-MX: [auth.page.ts]', error);
      await firstValueFrom(this.authService.logout());
      this.router.navigateByUrl('/auth');
    }

    await this.loadingService.dismiss();

  }

  private updateFormControls() {
    const isTutorControl = this.authForm.get('isTutor');
    if(!this.isLoginMode) {
      if(!isTutorControl) {
        this.authForm.addControl('isTutor', this.formBuilder.control(false));
      }
    } else {
      this.authForm.removeControl('isTutor');
    }
  }

  private async requestNotificationsAfterLogin() {
    if(!this.notificationService.isNotificationSupported()) {
      return;
    }

    const permission = this.notificationService.getPermissionStatus();

    if(permission === 'default') {
      await this.showNotificationPermissionDialog();
    } else if (permission === 'granted') {
      await this.notificationService.requestPermission();
    }
  }

  private async showNotificationPermissionDialog() {
    const alert = await this.alertController.create({
      header: '🔔 Notificaciones',
      message: 'Es importante que actives las notificaciones para recibir avisos sobre trabajos, disciplina y asistencia. Pulsa el botón Aceptar y después Permitir.',
      backdropDismiss: false,
      buttons: [
        {
          text: 'Aceptar',
          handler: () => {
            alert.dismiss();
            setTimeout(async () => {
              const token = await this.notificationService.requestPermission();
              if(token) {
                await this.showNotificationSuccessToast();
              }
            }, 100);
            return false;
          }
        }
      ]
    });

    await alert.present();
  }

  private async showNotificationSuccessToast() {
    this.toastMessage = '✅ Notificaciones activadas correctamente.';
    this.setOpenToast(true);
  }

}
