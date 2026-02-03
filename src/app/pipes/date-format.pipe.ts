import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'dateFormat',
  standalone: true
})

export class DateFormatPipe implements PipeTransform {

  transform(value: Date | any, format: string = 'full'): string {
    if (!value) return '';

    // Convertir Firestore Timestamp a Date si es necesario
    const date = value?.toDate ? value.toDate() : new Date(value);

    if (isNaN(date.getTime())) return '';

    // Extraer componentes
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    // Formatos disponibles
    switch (format) {
      case 'full':
        return `${day}/${month}/${year} (${hours}:${minutes})`;
      case 'date':
        return `${day}/${month}/${year}`;
      case 'time':
        return `${hours}:${minutes}`;
      case 'short':
        return `${day}/${month} ${hours}:${minutes}`;
      default:
        return `${day}/${month}/${year} (${hours}:${minutes})`;
    }
  }
}
