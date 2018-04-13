import { Chunk } from 'blockmap';
import { Disk, ReadResult, WriteResult } from 'file-disk';
import { Url } from 'url';

export interface ProgressEvent {
	bytes: number;  // amount of bytes actually read or written from/to the source/destination
	position: number;  // position in the stream (may be different from bytes if we skip some chunks)
	time: number;  // time actually spent reading or writing in milliseconds
	compressedBytes?: number;  // amount of bytes actually read from the compressed source
}

export interface SparseWriteStream extends NodeJS.WritableStream {
	_write(chunk: Chunk, enc: string, callback: (err?: Error | void) => void): void;
	on(event: 'progress', listener: (data: ProgressEvent) => void): this;
	on(event: string, listener: Function): this;
}

export interface Destination {
	createWriteStream(): Promise<NodeJS.WritableStream>;
	createSparseWriteStream(): Promise<SparseWriteStream>;
}

export interface RandomAccessibleDestination extends Destination {
	// Like a Destination but can be read and written to at any offset.
	// Can be used to configure an image after writing.
	size: number;
	read(buffer: Buffer, bufferOffset: number, length: number, sourceOffset: number): Promise<ReadResult>;
	write(buffer: Buffer, bufferOffset: number, length: number, destinationOffset: number): Promise<WriteResult>;
	flush(): Promise<void>;
}

export class DestinationDisk extends Disk {
	constructor(private destination: RandomAccessibleDestination) {
		super(
			false,  // readOnly
			false,  // recordWrites
			false,  // recordReads
			false,  // discardIsZero
		);
	}

	async _getCapacity(): Promise<number> {
		return this.destination.size;
	}

	async _read(buffer: Buffer, bufferOffset: number, length: number, fileOffset: number): Promise<ReadResult> {
		return await this.destination.read(buffer, bufferOffset, length, fileOffset);
	}

	async _write(buffer: Buffer, bufferOffset: number, length: number, fileOffset: number): Promise<WriteResult> {
		return await this.destination.write(buffer, bufferOffset, length, fileOffset);
	}

	async _flush(): Promise<void> {
		await this.destination.flush();
	}
}
