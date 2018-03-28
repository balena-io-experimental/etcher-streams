import * as fs from 'mz/fs';
import { Writable } from 'stream';

class FileSparseWriteStream extends Writable {
	private fd: number;

	constructor(private path: string, private size: number) {
		super({ objectMode: true });
		this.on('finish', this.__close.bind(this));
	}

	async __close() {
		await fs.close(this.fd);
		this.emit('close');
	}

	async __write(chunk, enc) {
		if (this.fd === undefined) {
			await fs.truncate(this.path, this.size);
			this.fd = await fs.open(this.path, 'w');
		}
		await fs.write(this.fd, chunk.buffer, 0, chunk.length, chunk.position);
	}

	_write(chunk, enc, callback) {
		this.__write(chunk, enc).then(callback, callback);
	}
}

export class FileDestination {
	constructor(path, size) {
		this.path = path;
		this.size = size;
	}

	async createWriteStream(options) {
		return fs.createWriteStream(this.path, options);
	}

	async createSparseWriteStream(options) {
		return new FileSparseWriteStream(this.path, this.size);
	}
}
