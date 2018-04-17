import * as Bluebird from 'bluebird';
import { ReadResult } from 'file-disk';
import { createReadStream, createWriteStream } from 'fs';
import { Url } from 'url';

import { RandomReadableSource, RandomReadableSourceMetadata, Source } from './source';
import { close, fstat, open, read, unlink } from '../fs';
import * as tmp from '../tmp';

export class FileSource extends RandomReadableSource {
	static protocol: string = 'file:';
	private size: number;

	constructor(private fd: number) {
		super();
	}

	private async getSize(): Promise<number> {
		if (this.size === undefined) {
			this.size = (await fstat(this.fd)).size;
		}
		return this.size;
	}

	async read(buffer: Buffer, bufferOffset: number, length: number, sourceOffset: number): Promise<ReadResult> {
		return await read(this.fd, buffer, bufferOffset, length, sourceOffset);
	}

	async createReadStream(): Promise<NodeJS.ReadableStream> {
		const stream = createReadStream('', { fd: this.fd, autoClose: false });
		let bytes = 0;
		stream.on('data', (buffer) => {
			bytes += buffer.length;
			stream.emit('progress', { bytes, position: bytes });
		});
		return stream;
	}

	async getMetadata(): Promise<RandomReadableSourceMetadata> {
		return {
			size: await this.getSize(),
		};
	}

	static async fromURL(parsed: Url): Promise<Bluebird.Disposer<FileSource>> {
		if (parsed.path === undefined) {
			throw new Error('Missing path');
		}
		const fd = await open(parsed.path, 'r');
		return Bluebird.resolve(new FileSource(fd))
		.disposer(async () => {
			await close(fd);
		});
	}
}

export const makeSourceRandomReadable = async (source: Source): Promise<Bluebird.Disposer<FileSource>> => {
	const { fd, path } = await tmp.file();
	const sourceStream = await source.createReadStream();
	const fileStream = createWriteStream('', { fd, autoClose: false });
	// TODO: emit progress events ?
	// TODO: the tmp file won't be removed if the copy fails, this could use combineDisposers
	await new Promise((resolve, reject) => {
		sourceStream.on('error', reject);
		fileStream.on('error', reject);
		sourceStream.on('end', resolve);
		sourceStream.pipe(fileStream);
	});
	await close(fd);  // TODO: why?
	const fd2 = await open(path, 'r');
	return Bluebird.resolve(new FileSource(fd2))
	.disposer(async () => {
		await close(fd2);
		await unlink(path);
	});
};
