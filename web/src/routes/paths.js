export const appPaths = {
    home: '/',
    login: '/login',
    accounts: '/accounts',
    lightsail: '/lightsail',
    ec2: '/ec2',
    newbie: '/newbie',
    regions: '/regions',
    quota: '/quota',
    billing: '/billing'
};

export const moduleMenuItems = [
    { key: 'home', label: '控制台', path: appPaths.home },
    { key: 'lightsail', label: 'Lightsail', path: appPaths.lightsail },
    { key: 'ec2', label: 'EC2', path: appPaths.ec2 },
    { key: 'newbie', label: '新手任务', path: appPaths.newbie },
    { key: 'regions', label: '区域', path: appPaths.regions },
    { key: 'quota', label: '配额', path: appPaths.quota },
    { key: 'billing', label: '账单', path: appPaths.billing },
];
