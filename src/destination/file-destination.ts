import * as Bluebird from 'bluebird';
import { Chunk } from 'blockmap';
import { ReadResult, WriteResult } from 'file-disk';
import { createWriteStream, close, fsync, open, read, write } from 'fs';
import { Writable } from 'stream';
import { Url } from 'url';
import { promisify } from 'util';

import { RandomAccessibleDestination, SparseWriteStream } from './destination';

const closeAsync = promisify(close);
const fsyncAsync = promisify(fsync);
const openAsync = promisify(open);
const readAsync = promisify(read);
const writeAsync = promisify(write);

export class FileSparseWriteStream extends Writable implements SparseWriteStream {
	constructor(private fd: number) {
		super({ objectMode: true });
	}

	private async __write(chunk: Chunk, enc: string): Promise<void> {
		await writeAsync(this.fd, chunk.buffer, 0, chunk.length, chunk.position);
	}

	_write(chunk: Chunk, enc: string, callback?: (err?: Error | void) => void): void {
		this.__write(chunk, enc).then(callback, callback);
	}
}

export class FileDestination extends RandomAccessibleDestination {
	constructor(private fd: number) {
		super();
	}

	async createWriteStream(): Promise<NodeJS.WritableStream> {
		return createWriteStream('', { fd: this.fd, autoClose: false });
	}

	async createSparseWriteStream(): Promise<FileSparseWriteStream> {
		return new FileSparseWriteStream(this.fd);
	}

	async read(buffer: Buffer, bufferOffset: number, length: number, fileOffset: number): Promise<ReadResult> {
		return await readAsync(this.fd, buffer, bufferOffset, length, fileOffset);
	}

	async write(buffer: Buffer, bufferOffset: number, length: number, fileOffset: number): Promise<WriteResult> {
		return await writeAsync(this.fd, buffer, bufferOffset, length, fileOffset);
	}

	async flush(): Promise<void> {
		await fsyncAsync(this.fd);
	}

	static async createDisposer(path: string): Promise<Bluebird.Disposer<FileDestination>> {
		const fd = await openAsync(path, 'w+');
		return Bluebird.resolve(new FileDestination(fd))
		.disposer(async () => {
			await closeAsync(fd);
		});
	}
}
