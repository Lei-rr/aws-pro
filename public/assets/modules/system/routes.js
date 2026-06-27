import AppLayout from './layouts/AppLayout.js';
import DashboardView from './views/DashboardView.js';
import LoginView from './views/LoginView.js';
import UserView from './views/UserView.js';

export const systemRoutes = {
    layout: AppLayout,
    dashboard: DashboardView,
    login: LoginView,
    user: UserView,
};

export const publicRoutes = [
    { path: '/login', component: LoginView },
];

export const systemRouteIds = new Set(['', 'user', 'accounts', 'lightsail', 'regions', 'quota', 'billing']);

export const childRoutes = [
    { path: '', component: DashboardView },
    { path: 'user', component: UserView },
];
