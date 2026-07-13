import AppLayout from './layouts/AppLayout.vue';
import DashboardView from './views/DashboardView.vue';
import LoginView from './views/LoginView.vue';

export const systemRoutes = {
    layout: AppLayout,
    dashboard: DashboardView,
    login: LoginView,
};

export const publicRoutes = [
    { path: '/login', component: LoginView },
];

export const childRoutes = [
    { path: '', component: DashboardView },
];
