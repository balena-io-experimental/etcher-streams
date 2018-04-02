import { createFilterStream, FilterStream } from 'blockmap';
import * as Bluebird from 'bluebird';
import { DiscardDiskChunk, Disk, ReadResult, WriteResult } from 'file-disk';
import * as _ from 'lodash';
import { getPartitions } from 'partitioninfo';
import { interact, AsyncFsLike } from 'resin-image-fs';
import { Transform } from 'stream';

import { configure } from './configure';
import { Source, SourceMetadata } from '../source';

const BLOCK_SIZE = 512;

class SourceDisk extends Disk {
	constructor(private source: Source) {
		super(
			true,  // readOnly
			true,  // recordWrites
			true,  // recordReads
			true,  // discardIsZero
		);
	}

	async _getCapacity(): Promise<number> {
		return (await this.source.getMetadata()).size;
	}

	async _read(buffer: Buffer, bufferOffset: number, length: number, fileOffset: number): Promise<ReadResult> {
		return await this.source.read(buffer, bufferOffset, length, fileOffset);
	}

	async _write(buffer: Buffer, bufferOffset: number, length: number, fileOffset: number): Promise<WriteResult> {
		throw new Error("Can't write to a SourceDisk");
	}

	async _flush(): Promise<void> {
	}
}

export class ConfiguredSource implements Source {
	private disk: SourceDisk;

	private constructor(private source: Source, private config: any, private trimPartitions: boolean) {
		this.disk = new SourceDisk(source);
	}

	async read(buffer: Buffer, bufferOffset: number, length: number, sourceOffset: number): Promise<ReadResult> {
		return await this.disk.read(buffer, bufferOffset, length, sourceOffset);
	}

	async createReadStream(): Promise<NodeJS.ReadableStream> {
		const imageStream = await this.source.createReadStream();
		const transform = this.disk.getTransformStream();
		imageStream.on('error', (err) => {
			transform.emit('error', err);
		});
		imageStream.pipe(transform);
		return transform;
	}

	async createSparseReadStream(): Promise<FilterStream> {
		const stream = await this.createReadStream();
		const blockmap = await this.disk.getBlockMap(BLOCK_SIZE, false);
		console.log('blockmap', blockmap);
		const transform = createFilterStream(blockmap, { verify: false });
		stream.on('error', (error: Error) => {
			transform.emit('error', error);
		});
		stream.pipe(transform);
		return transform;
	}

	async getMetadata(): Promise<SourceMetadata> {
		return await this.source.getMetadata();
	}

	async _trimPartitions(): Promise<void> {
		if (!this.trimPartitions) {
			return;
		}
		const { partitions } = await getPartitions(this.disk, { includeExtended: false });
		for (const partition of partitions) {
			await Bluebird.using(interact(this.disk, partition.index), async (fs: AsyncFsLike) => {
				if (!_.isUndefined(fs.trimAsync)) {
					await fs.trimAsync();
				}
			});
		}
		const discards = this.disk.getDiscardedChunks();
		const discardedBytes = discards
		.map((d: DiscardDiskChunk) => {
			return d.end - d.start + 1;
		})
		.reduce((a: number, b: number) => {
			return a + b;
		});
		const metadata = await this.getMetadata();
		const percentage = Math.round(discardedBytes / metadata.size * 100);
		console.log(`discarded ${discards.length} chunks, ${discardedBytes} bytes, ${percentage}% of the image`);
	}

	async _configure(): Promise<void> {
		if (!this.config) {
			return;
		}
		await configure(this.disk, { config: this.config });
	}

	static async fromSource(source: Source, config: any, trimPartitions: boolean): Promise<ConfiguredSource> {
		const configuredSource = new ConfiguredSource(source, config, trimPartitions);
		await configuredSource._configure();
		await configuredSource._trimPartitions();
		return configuredSource;
	}
}
