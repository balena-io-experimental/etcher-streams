import * as Bluebird from 'bluebird';
import { createReadStream } from 'fs';
import * as _ from 'lodash';
import { Url } from 'url';
import { ZipStreamEntry } from 'unzip-stream';

import { Source, SourceMetadata } from './source';
import { getFileStreamFromZipStream } from '../zip';

export class ZipSource extends Source {
	static protocol: string = 'file:';
	static extensions: string[] = [ '.zip' ];
	private entry: ZipStreamEntry;

	constructor(private path: string) {
		super();
	}

	private async getEntry(): Promise<ZipStreamEntry> {
		if (this.entry === undefined) {
			this.entry = await getFileStreamFromZipStream(createReadStream(this.path));
		}
		return this.entry;
	}

	async createReadStream(): Promise<NodeJS.ReadableStream> {
		return await this.getEntry();
	}

	async getMetadata(): Promise<SourceMetadata> {
		const entry = await this.getEntry();
		return {
			size: entry.size,
			compressedSize: entry.compressedSize,
		};
	}

	static async fromURL(parsed: Url): Promise<Bluebird.Disposer<ZipSource>> {
		if (parsed.path === undefined) {
			throw new Error('Missing path');
		}
		return Bluebird.resolve(new ZipSource(parsed.path)).disposer(_.noop);
	}
}
