import { createFilterStream } from 'blockmap';
import * as Promise from 'bluebird';
import { Disk, DiskTransformStream } from 'file-disk';
import * as iisect from 'interval-intersection';
import * as _ from 'lodash';
import { getPartitions } from 'partitioninfo';
import { interact } from 'resin-image-fs';
import { Transform } from 'stream';

import { configure } from './configure';

class SourceDisk extends Disk {
	constructor(source) {
		super(
			true,  // readOnly
			true,  // recordWrites
			true,  // recordReads
			true,  // discardIsZero
		);
		this.source = source;
	}

	async _getCapacity() {
		return (await this.source.getMetadata()).size;
	}

	async _read(buffer, bufferOffset, length, fileOffset) {
		return await this.source.read(buffer, bufferOffset, length, fileOffset);
	}
}

export class ConfiguredSource {
	constructor(source, config, trimPartitions) {
		this.source = source;
		this.config = config;
		this.trimPartitions = trimPartitions;
		this.disk = new SourceDisk(source);
	}

	async read(buffer, bufferOffset, length, sourceOffset) {
		return await new Promise((resolve, reject) => {
			this.disk.read(buffer, bufferOffset, length, sourceOffset, (err, bytesRead, buffer) => {
				if (err) {
					reject(err);
					return;
				}
				resolve({ bytesRead, buffer });
			});
		});
	}

	/**
	 * Create a readable stream
	 * @see {@link https://nodejs.org/api/fs.html#fs_fs_createreadstream_path_options}
	 * @param {Object} [options]
	 * @param {Number} [options.start]
	 * @param {Number} [options.end]
	 * @param {Number} [options.highWaterMark=16*1024]
	 * @returns stream.Readable
	 */
	async createReadStream(options) {  // TODO: handle start and end
		if (!_.isUndefined(options.start) || !_.isUndefined(options.end)) {
			throw new Error('Not implemented: start and end options');
		}
		const imageStream = await this.source.createReadStream();  // TODO: pass options
		const transform = this.disk.getTransformStream();
		imageStream.pipe(transform);
		return transform;
	}

	async createSparseReadStream(options) {  // TODO: handle start and end
		const stream = await this.createReadStream(options);
		const blockmap = await this.disk.getBlockMap(512, false);
		console.log('blockmap', blockmap);
		const transform = createFilterStream(blockmap, { verify: false });
		stream.on('error', (error) => {
			transform.emit('error', error);
		});
		stream.pipe(transform);
		return transform;
	}

	async getMetadata() {
		return await this.source.getMetadata();  // TODO: additional metadata?
	}

	async _trimPartitions() {
		if (!this.trimPartitions) {
			return;
		}
		const { partitions } = await getPartitions(this.disk, { includeExtended: false });
		for (const partition of partitions) {
			await Promise.using(interact(this.disk, partition.index), async (fs) => {
				if (!_.isUndefined(fs.trimAsync)) {
					await fs.trimAsync();
				}
			});
		}
		const discards = this.disk.getDiscardedChunks();
		const discardedBytes = discards.map((d) => d.end - d.start + 1).reduce((a, b) => a + b);
		const metadata = await this.getMetadata();
		const percentage = Math.round(discardedBytes / metadata.size * 100);
		console.log(`discarded ${discards.length} chunks, ${discardedBytes} bytes, ${percentage}% of the image`);
	}

	async _configure() {
		if (!this.config) {
			return;
		}
		await configure(this.disk, { config: this.config });
	}

	static async fromSource(source, config, trimPartitions) {
		const configuredSource = new ConfiguredSource(source, config, trimPartitions);
		await configuredSource._configure();
		await configuredSource._trimPartitions();
		return configuredSource;
	}
}
