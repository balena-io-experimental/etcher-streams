import { Chunk } from 'blockmap';
import { createWriteStream, close, open, truncate, write } from 'fs';
import { Writable } from 'stream';
import { promisify } from 'util';

import { Destination, SparseWriteStream } from './destination';

const closeAsync = promisify(close);
const openAsync = promisify(open);
const truncateAsync = promisify(truncate);
const writeAsync = promisify(write);

export class FileSparseWriteStream extends Writable implements SparseWriteStream {
	private fd: number;

	constructor(private path: string, private size: number) {
		super({ objectMode: true });
		this.on('finish', this.__close.bind(this));
	}

	async __close(): Promise<void> {
		await closeAsync(this.fd);
		this.emit('close');
	}

	async __write(chunk: Chunk, enc: string): Promise<void> {
		if (this.fd === undefined) {
			await truncateAsync(this.path, this.size);
			this.fd = await openAsync(this.path, 'w');
		}
		await writeAsync(this.fd, chunk.buffer, 0, chunk.length, chunk.position);
	}

	_write(chunk: Chunk, enc: string, callback?: (err?: Error | void) => void): void {
		this.__write(chunk, enc).then(callback, callback);
	}
}

export class FileDestination implements Destination {
	constructor(private path: string, private size: number) {
	}

	async createWriteStream(): Promise<NodeJS.WritableStream> {
		return createWriteStream(this.path);
	}

	async createSparseWriteStream(): Promise<FileSparseWriteStream> {
		return new FileSparseWriteStream(this.path, this.size);
	}
}
