import * as Bluebird from 'bluebird';
import { ReadResult } from 'file-disk';
import { Url } from 'url';

export interface SourceMetadata {
	size: number;
	compressedSize?: number;
}

export abstract class Source {
	static protocol: string;
	static extensions?: string[];
	abstract createReadStream(): Promise<NodeJS.ReadableStream>;
	abstract getMetadata(): Promise<SourceMetadata>;
	static fromURL(parsed: Url): Bluebird.Disposer<Source> {
		// Work around TypeScript not allowing abstract static methods.
		// You need to implement this in subclasses to avoid a run time error.
		throw new Error('Not implemented');
	}
	static canOpenURL(parsed: Url): boolean {
		if ((parsed.path !== undefined) && (parsed.protocol === this.protocol)) {
			if (this.extensions === undefined) {
				return true;
			}
			for (const extension of this.extensions) {
				if (parsed.path.endsWith(extension)) {
					return true;
				}
			}
		}
		return false;
	}
}

export abstract class RandomReadableSource extends Source {
	abstract read(buffer: Buffer, bufferOffset: number, length: number, sourceOffset: number): Promise<ReadResult>;
}
