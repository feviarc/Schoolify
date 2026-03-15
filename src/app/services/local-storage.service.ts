import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})

export class LocalStorageService {

  private readonly CCT_KEY = 'schoolify_clave_centro_trabajo';
  private readonly SHIFT_KEY = 'schoolify_turno';

  constructor() { }

  deleteAllKeys() {
    this.deleteKey(this.CCT_KEY);
    this.deleteKey(this.SHIFT_KEY);
  }

  deleteKey(key: string): boolean {
    try {
      localStorage.removeItem(key);
      return true;

    } catch (error) {
      console.error('❌ Schoolify: [local-storage.service.ts]', error);
      return false;
    }
  }

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

  hasKey(key: string): boolean {
    return this.getKey(key) !== null;
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
