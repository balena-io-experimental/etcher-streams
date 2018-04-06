import * as Bluebird from 'bluebird';
import { ReadResult } from 'file-disk';
import { close, createReadStream, fstat, open, read } from 'fs';
import { Url } from 'url';
import { promisify } from 'util';

import { RandomReadableSource, SourceMetadata } from './source';

const closeAsync = promisify(close);
const openAsync = promisify(open);
const readAsync = promisify(read);
const fstatAsync = promisify(fstat);

export class FileSource extends RandomReadableSource {
	static protocol: string = 'file:';

	constructor(private fd: number) {
		super();
	}

	async read(buffer: Buffer, bufferOffset: number, length: number, sourceOffset: number): Promise<ReadResult> {
		return await readAsync(this.fd, buffer, bufferOffset, length, sourceOffset);
	}

	async createReadStream(): Promise<NodeJS.ReadableStream> {
		return createReadStream('', { fd: this.fd, autoClose: false });
	}

	async getMetadata(): Promise<SourceMetadata> {
		return {
			size: (await fstatAsync(this.fd)).size,
		};
	}

	static fromURL(parsed: Url): Bluebird.Disposer<FileSource> {
		if (parsed.path === undefined) {
			throw new Error('Missing path');
		}
		return openAsync(parsed.path, 'r')
		.then((fd: number) => {
			return Bluebird.resolve(new FileSource(fd))
			.disposer(() => {
				return closeAsync(fd);
			});
		});
	}
}

//export class TemporaryFileSource extends FileSource {
//	async close(): Promise<void> {
//		await super.close();
//		await unlinkAsync(this.path);
//	}
//}
//
//export const makeSourceRandomReadable(source: Source): Bluebird.Disposer<RandomReadableSource> {
//	tmp.file
//}
