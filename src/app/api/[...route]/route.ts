import { Hono } from 'hono';
import { handle } from 'hono/vercel';

import achievements from './achievements';
import sudoers from './sudoers';
import users from './users';


const app = new Hono().basePath('/api');
const _route = app
  .route('/achievements', achievements)
  .route('/sudoers', sudoers)
  .route('/users', users);


// Next.js handler
export const GET = handle(app);
export const POST = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);

export type AppType = typeof _route;
