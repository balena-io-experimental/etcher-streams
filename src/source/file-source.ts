import * as Bluebird from 'bluebird';
import { ReadResult } from 'file-disk';
import { close, createReadStream, createWriteStream, fstat, open, read, unlink } from 'fs';
import { Url } from 'url';
import { promisify } from 'util';

import { RandomReadableSource, RandomReadableSourceMetadata, Source } from './source';
import * as tmp from '../tmp';

const closeAsync = promisify(close);
const openAsync = promisify(open);
const readAsync = promisify(read);
const fstatAsync = promisify(fstat);
const unlinkAsync = promisify(unlink);

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

	async getMetadata(): Promise<RandomReadableSourceMetadata> {
		return {
			size: (await fstatAsync(this.fd)).size,
		};
	}

	static async fromURL(parsed: Url): Promise<Bluebird.Disposer<FileSource>> {
		if (parsed.path === undefined) {
			throw new Error('Missing path');
		}
		const fd = await openAsync(parsed.path, 'r');
		return Bluebird.resolve(new FileSource(fd))
		.disposer(async () => {
			await closeAsync(fd);
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
		fileStream.on('finish', resolve);
	});
	return Bluebird.resolve(new FileSource(fd))
	.disposer(async () => {
		await closeAsync(fd);
		await unlinkAsync(path);
	});
};
