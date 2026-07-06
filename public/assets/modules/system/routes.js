import AppLayout from './layouts/AppLayout.js';
import DashboardView from './views/DashboardView.js';
import LoginView from './views/LoginView.js';

export const systemRoutes = {
    layout: AppLayout,
    dashboard: DashboardView,
    login: LoginView,
};

export const publicRoutes = [
    { path: '/login', component: LoginView },
];

export const systemRouteIds = new Set(['', 'accounts', 'lightsail', 'ec2', 'newbie', 'regions', 'quota', 'billing']);

export const childRoutes = [
    { path: '', component: DashboardView },
];
