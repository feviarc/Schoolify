import { Routes } from '@angular/router';
import { validSchoolGuard } from './guards/valid-school-guard';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'portal',
    pathMatch: 'full',
  },
  {
    path: 'portal',
    loadComponent: () => import('./portal/portal.page').then( m => m.PortalPage)
  },
  {
    path: 'auth',
    loadComponent: () => import('./auth/auth.page').then( m => m.AuthPage),
    canActivate: [validSchoolGuard]
  },
  {
    path: 'admin-dashboard',
    loadComponent: () => import('./admin/admin.page').then( m => m.AdminPage),
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    data: {expectedRole: 'administrador'},
    children: [
      {
        path: 'tab-users',
        loadComponent: () => import('./admin/tab-users/tab-users.component').then((m) => m.TabUsersComponent)
      },
      {
        path: 'tab-schools',
        loadComponent: () => import('./admin/tab-schools/tab-schools.component').then((m) => m.TabSchoolsComponent)
      },
      {
        path: 'tab-notifications',
        loadComponent: () => import('./admin/tab-notifications/tab-notifications.component').then((m) => m.TabNotificationsComponent)
      },
      {
        path: '',
        redirectTo: '/admin-dashboard/tab-users',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: 'teacher-dashboard',
    loadComponent: () => import('./teacher/teacher.page').then( m => m.TeacherPage),
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    data: {expectedRole: 'maestro'},
    children: [
      {
        path: 'tab-notifications',
        loadComponent: () => import('./teacher/tab-notifications/tab-notifications.component').then((m) => m.TabNotificationsComponent)
      },
      {
        path: 'tab-students',
        loadComponent: () => import('./teacher/tab-students/tab-students.component').then((m) => m.TabStudentsComponent)
      },
      {
        path: 'tab-groups',
        loadComponent: () => import('./teacher/tab-groups/tab-groups.component').then((m) => m.TabGroupsComponent)
      },
      {
        path: '',
        redirectTo: '/teacher-dashboard/tab-notifications',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: 'caregiver-dashboard',
    loadComponent: () => import('./caregiver/caregiver.page').then( m => m.CaregiverPage),
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    data: {expectedRole: 'tutor'},
    children: [
      {
        path: 'tab-notifications',
        loadComponent: () => import('./caregiver/tab-notifications/tab-notifications.component').then((m) => m.TabNotificationsComponent)
      },
      {
        path: 'tab-students',
        loadComponent: () => import('./caregiver/tab-students/tab-students.component').then((m) => m.TabStudentsComponent)
      },
      {
        path: 'tab-contact',
        loadComponent: () => import('./caregiver/tab-contact/tab-contact.component').then((m) => m.TabContactComponent)
      },
      {
        path: '',
        redirectTo: '/caregiver-dashboard/tab-notifications',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'portal'
  }
];
