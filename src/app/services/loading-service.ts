import { Injectable, inject } from '@angular/core';
import { LoadingController } from '@ionic/angular/standalone';


@Injectable({providedIn: 'root'})
export class LoadingService {
  private loadingController = inject(LoadingController);


  private loading: HTMLIonLoadingElement | null = null;
  private isLoadingActive = false;

  async present(message: string = '', duration: number = 0): Promise<void> {
    if (this.isLoadingActive) {
      return;
    }

    try {
      this.loading = await this.loadingController.create({
        message: message,
        duration: duration,
        spinner: 'crescent',
        cssClass: 'custom-loading',
        backdropDismiss: false
      });

      this.isLoadingActive = true;
      await this.loading.present();

      if (duration > 0) {
        setTimeout(() => {
          this.isLoadingActive = false;
          this.loading = null;
        }, duration);
      }

    } catch (error) {
      console.error('❌ Schoolify: [loading-service.ts]', error);
      this.isLoadingActive = false;
    }
  }

  async dismiss(): Promise<void> {
    if (!this.loading || !this.isLoadingActive) {
      return;
    }

    try {
      await this.loading.dismiss();
      this.isLoadingActive = false;
      this.loading = null;

    } catch (error) {
      console.error('❌ Schoolify: [loading-service.ts]', error);
      this.isLoadingActive = false;
      this.loading = null;
    }
  }

  async updateMessage(message: string): Promise<void> {
    if (this.loading && this.isLoadingActive) {
      this.loading.message = message;
    }
  }
}
