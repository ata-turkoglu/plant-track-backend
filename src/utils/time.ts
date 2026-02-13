import moment from 'moment';

export const nowIso = (): string => moment.utc().toISOString();
