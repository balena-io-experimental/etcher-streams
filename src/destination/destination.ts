import { Chunk } from 'blockmap';
import { Disk, ReadResult, WriteResult } from 'file-disk';
import { Url } from 'url';

export interface SparseWriteStream extends NodeJS.WritableStream {
	_write(chunk: Chunk, enc: string, callback: (err?: Error | void) => void): void;
}

export abstract class Destination {
	abstract createWriteStream(): Promise<NodeJS.WritableStream>;
	abstract createSparseWriteStream(): Promise<SparseWriteStream>;
}

export abstract class RandomAccessibleDestination extends Destination {
	// Like a Destination but can be read and written to at any offset.
	// Can be used to configure an image after writing.
	size: number;
	abstract read(buffer: Buffer, bufferOffset: number, length: number, sourceOffset: number): Promise<ReadResult>;
	abstract write(buffer: Buffer, bufferOffset: number, length: number, destinationOffset: number): Promise<WriteResult>;
	abstract flush(): Promise<void>;
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
