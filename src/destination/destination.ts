import { Chunk } from 'blockmap';

export interface SparseWriteStream extends NodeJS.WritableStream {
	_write(chunk: Chunk, enc: string, callback: (err?: Error | void) => void): void;
}

export interface Destination {
	createWriteStream(): Promise<NodeJS.WritableStream>;
	createSparseWriteStream(): Promise<SparseWriteStream>;
}
