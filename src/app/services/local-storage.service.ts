import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})

export class LocalStorageService {

  readonly CCT_KEY = 'schoolify_clave_centro_trabajo';
  readonly SHIFT_KEY = 'schoolify_turno';

  constructor() { }

  getKey(key: string): string | null {
    try {
      const value = localStorage.getItem(key);

      if (!value) {
        return null;
      }

      return value;

    } catch (error) {
      console.error('❌ Schoolify: [local-storage.service.ts]', error);
      return null;
    }
  }

  saveKey(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value.trim());
      return true;

    } catch (error) {
      console.error('❌ Schoolify: [local-storage.service.ts]', error);
      return false;
    }
  }
}
