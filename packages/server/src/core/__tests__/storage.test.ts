import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemoryStorage } from '../memory-storage';
import { FileStorage } from '../../node/file-storage';
import { CommentStore } from '../../store';
import { storageContract } from './storage-contract';

storageContract('memory', () => new MemoryStorage());
storageContract('file', () => new FileStorage(new CommentStore(mkdtempSync(path.join(tmpdir(), 'grabby-fs-')))));
