import { describe } from 'vitest';
import { D1Storage } from '../d1-storage';
import { storageContract } from '../../core/__tests__/storage-contract';
import { sqliteD1 } from './sqlite-d1';

const [major, minor] = process.versions.node.split('.').map(Number);
const hasSqlite = major > 22 || (major === 22 && minor >= 5);

describe.skipIf(!hasSqlite)('D1', () => {
  storageContract('d1', async () => new D1Storage(await sqliteD1()));
});
