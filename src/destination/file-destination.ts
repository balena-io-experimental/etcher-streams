import * as Bluebird from 'bluebird';
import { Chunk } from 'blockmap';
import { ReadResult, WriteResult } from 'file-disk';
import { createWriteStream, close, fsync, open, read, write } from 'fs';
import { Writable } from 'stream';
import { Url } from 'url';
import { promisify } from 'util';

import { Destination, RandomAccessibleDestination, SparseWriteStream } from './destination';

const closeAsync = promisify(close);
const fsyncAsync = promisify(fsync);
const openAsync = promisify(open);
const readAsync = promisify(read);
const writeAsync = promisify(write);

export class FileSparseWriteStream extends Writable implements SparseWriteStream {
	private position: number;
	private bytes = 0;
	private timeSpentWriting = 0;

	constructor(private fd: number) {
		super({ objectMode: true });
	}

	private emitProgress(): void {
		this.emit('progress', {
			bytes: this.bytes,
			position: this.position,
			time: this.timeSpentWriting,
		});
	}

	private async __write(chunk: Chunk, enc: string): Promise<void> {
		try {
			if (this.position !== chunk.position) {
				this.position = chunk.position;
				this.emitProgress();
			}
			const start = Date.now();
			await writeAsync(this.fd, chunk.buffer, 0, chunk.length, chunk.position);
			const end = Date.now();
			this.timeSpentWriting += end - start;
			this.position += chunk.length;
			this.bytes += chunk.length;
			this.emitProgress();
		} catch (error) {
			this.emit('error', error);
		}
	}

	_write(chunk: Chunk, enc: string, callback?: (err?: Error | void) => void): void {
		this.__write(chunk, enc).then(callback, callback);
	}
}

export class FileDestination implements Destination {
	constructor(protected fd: number) {
	}

	async createWriteStream(): Promise<NodeJS.WritableStream> {
		return createWriteStream('', { fd: this.fd, autoClose: false });
	}

	async createSparseWriteStream(): Promise<FileSparseWriteStream> {
		return new FileSparseWriteStream(this.fd);
	}

	static async createDisposer(path: string, size?: number): Promise<Bluebird.Disposer<FileDestination>> {
		// size wll never be used, it is only here so RandomAccessibleFileDestination can inherit from this.
		// TODO: we need a better solution to this.
		const fd = await openAsync(path, 'w+');
		return Bluebird.resolve(new FileDestination(fd))
		.disposer(async () => {
			await closeAsync(fd);
		});
	}
}

export class RandomAccessibleFileDestination extends FileDestination implements RandomAccessibleFileDestination {
	constructor(fd: number, public size: number) {
		super(fd);
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

	static async createDisposer(path: string, size: number): Promise<Bluebird.Disposer<RandomAccessibleFileDestination>> {
		const fd = await openAsync(path, 'w+');
		return Bluebird.resolve(new RandomAccessibleFileDestination(fd, size))
		.disposer(async () => {
			await closeAsync(fd);
		});
	}
}
