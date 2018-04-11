import { createFilterStream, FilterStream } from 'blockmap';
import * as Bluebird from 'bluebird';
import { DiscardDiskChunk, Disk, ReadResult, WriteResult } from 'file-disk';
import * as _ from 'lodash';
import { getPartitions } from 'partitioninfo';
import { interact, AsyncFsLike } from 'resin-image-fs';
import { Transform } from 'stream';

import { RandomReadableSource, RandomReadableSourceMetadata } from '../source';

const BLOCK_SIZE = 512;

export type ConfigureFunction = (disk: Disk, config: any) => Promise<void>;

export class SourceDisk extends Disk {
	constructor(private source: RandomReadableSource) {
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

export class ConfiguredSource extends RandomReadableSource {
	private disk: SourceDisk;

	private constructor(private source: RandomReadableSource) {
		super();
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

	async getMetadata(): Promise<RandomReadableSourceMetadata> {
		return await this.source.getMetadata();
	}

	private async trimPartitions(): Promise<void> {
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
		});  // TODO: discarededBytes in metadata ?
		const metadata = await this.getMetadata();
		const percentage = Math.round(discardedBytes / metadata.size * 100);
		console.log(`discarded ${discards.length} chunks, ${discardedBytes} bytes, ${percentage}% of the image`);
	}

	static async fromSource(source: RandomReadableSource, shouldTrimPartitions: boolean, configure?: ConfigureFunction, config?: any): Promise<ConfiguredSource> {
		const configuredSource = new ConfiguredSource(source);
		if (configure !== undefined) {
			await configure(configuredSource.disk, config);
		}
		if (shouldTrimPartitions) {
			await configuredSource.trimPartitions();
		}
		return configuredSource;
	}
}
