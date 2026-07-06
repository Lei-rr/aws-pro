import { childRoutes as accountsRoutes } from './accounts/routes.js';
import { childRoutes as billingRoutes } from './billing/routes.js';
import { childRoutes as ec2Routes } from './ec2/routes.js';
import { childRoutes as lightsailRoutes } from './lightsail/routes.js';
import { childRoutes as newbieRoutes } from './newbie/routes.js';
import { childRoutes as quotaRoutes } from './quota/routes.js';
import { childRoutes as regionsRoutes } from './regions/routes.js';
import { childRoutes as systemChildRoutes, publicRoutes } from './system/routes.js';

export const modulePublicRoutes = [
    ...publicRoutes,
];

export const moduleChildRoutes = [
    ...systemChildRoutes,
    ...accountsRoutes,
    ...lightsailRoutes,
    ...ec2Routes,
    ...newbieRoutes,
    ...regionsRoutes,
    ...quotaRoutes,
    ...billingRoutes,
];
