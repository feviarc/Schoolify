import { Injectable } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';
import { filter } from 'rxjs/operators';


@Injectable({
  providedIn: 'root'
})

export class AppUpdateService {

  private updateAvailableSubject = new BehaviorSubject<boolean>(false);
  public updateAvailable$ = this.updateAvailableSubject.asObservable();

  constructor(private swUpdate: SwUpdate) {
    this.checkForUpdates();
  }

  private checkForUpdates() {

    if (!this.swUpdate.isEnabled) {
      console.log('⚠️ El Service Worker para actualización de la aplicación no está habilitado');
      return;
    }

    // Escuchar cuando hay una nueva versión disponible
    this.swUpdate.versionUpdates.pipe(
      filter((vre): vre is VersionReadyEvent => vre.type === 'VERSION_READY')
    ).subscribe(event => {
      console.log('✅ Nueva versión disponible:', event.latestVersion);
      this.updateAvailableSubject.next(true);
    });

    // Verificar si hay actualizaciones cada 24 horas
    setInterval(() => {
      this.swUpdate.checkForUpdate();
    }, 12 * 60 * 60 * 1000);
  }

  async applyUpdate(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
      console.log('🔄 Recargando aplicación...');
      window.location.reload();
    } catch (error) {
      console.error('❌ Escuela-MX: [app.update.service.ts]:', error);
    }
  }
}
