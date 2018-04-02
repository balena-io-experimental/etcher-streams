import { ReadResult } from 'file-disk';

export interface SourceMetadata {
	size: number;
	compressedSize?: number;
}

export interface Source {
	read(buffer: Buffer, bufferOffset: number, length: number, sourceOffset: number): Promise<ReadResult>;
	createReadStream(): Promise<NodeJS.ReadableStream>;
	getMetadata(): Promise<SourceMetadata>;
}
