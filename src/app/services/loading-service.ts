import { Injectable } from '@angular/core';
import { LoadingController } from '@ionic/angular/standalone';


@Injectable({providedIn: 'root'})
export class LoadingService {

  private loading: HTMLIonLoadingElement | null = null;
  private isLoadingActive = false;

  constructor(private loadingController: LoadingController) { }

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
      console.error('❌ Escuela-MX: [loading-service.ts]', error);
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
      console.error('❌ Escuela-MX: [loading-service.ts]', error);
      this.isLoadingActive = false;
      this.loading = null;
    }
  }

  isActive(): boolean {
    return this.isLoadingActive;
  }

  async updateMessage(message: string): Promise<void> {
    if (this.loading && this.isLoadingActive) {
      this.loading.message = message;
    }
  }

  async forceClose(): Promise<void> {
    try {
      if (this.loading) {
        await this.loading.dismiss();
      }

      const topLoading = await this.loadingController.getTop();
      if (topLoading) {
        await topLoading.dismiss();
      }

    } catch (error) {
      console.error('❌ Escuela-MX: [loading-service.ts]', error);

    } finally {
      this.isLoadingActive = false;
      this.loading = null;
    }
  }
}
