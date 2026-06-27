export const appPaths = {
    home: '/',
    login: '/login',
    user: '/user',
    accounts: '/accounts',
    lightsail: '/lightsail',
    regions: '/regions',
    quota: '/quota',
    billing: '/billing'
};

export const moduleMenuItems = [
    { key: 'home', label: '控制台', path: appPaths.home },
    { key: 'lightsail', label: 'Lightsail', path: appPaths.lightsail },
    { key: 'regions', label: '区域', path: appPaths.regions },
    { key: 'quota', label: '配额', path: appPaths.quota },
    { key: 'billing', label: '账单', path: appPaths.billing },
];
