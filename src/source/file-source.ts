import { ReadResult } from 'file-disk';
import { createReadStream, fstat, open, read } from 'fs';
import { promisify } from 'util';

import { Source, SourceMetadata } from './source';

const openAsync = promisify(open);
const readAsync = promisify(read);
const fstatAsync = promisify(fstat);

export class FileSource implements Source {
	private fd: number;

	constructor(private path: string) {
	}

	async _getFd(): Promise<number> {
		if (this.fd === undefined) {
			this.fd = await openAsync(this.path, 'r');
		}
		return this.fd;
	}

	async read(buffer: Buffer, bufferOffset: number, length: number, sourceOffset: number): Promise<ReadResult> {
		const fd = await this._getFd();
		return await readAsync(fd, buffer, bufferOffset, length, sourceOffset);
	}

	async createReadStream(): Promise<NodeJS.ReadableStream> {
		return createReadStream('', { fd: await this._getFd() });
	}

	async getMetadata(): Promise<SourceMetadata> {
		const fd = await this._getFd();
		return {
			size: (await fstatAsync(fd)).size,
		};
	}
}
