import { hc } from 'hono/client';

import type { AppType } from '@/app/api/[...route]/route';


const honoClient = hc<AppType>('/');
export const api = honoClient.api;
