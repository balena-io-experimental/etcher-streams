import * as Promise from 'bluebird'
import { Disk } from 'file-disk'
import * as iisect from 'interval-intersection'
import * as _ from 'lodash'
import { Transform } from 'stream'

import { configure } from './configure'

class FileDiskTransformStream extends Transform {  // TODO: this should be in filedisk.Disk
	constructor(disk) {
		super()
		this.disk = disk
		this.position = 0
		this.chunks = this._getKnownChunks()
		this.currentChunk = this.chunks.next().value
	}

	*_getKnownChunks() {
		for (let chunk of this.disk.knownChunks) {  // TODO: filter out discards
			yield chunk
		}
	}

	_transform(chunk, enc, cb) {
		const start = this.position
		const end = start + chunk.length - 1
		const interval = [start, end]
		while (this.currentChunk) {
			if (iisect(this.currentChunk.interval(), interval)) {
				const buf = this.currentChunk.data()
				const startShift = this.currentChunk.start - start
				const endShift = this.currentChunk.end - end
				const sourceStart = -Math.min(startShift, 0)
				const sourceEnd = buf.length - Math.max(endShift, 0)
				const targetStart = Math.max(startShift, 0)
				buf.copy(chunk, targetStart, sourceStart, sourceEnd)
			}
			if (this.currentChunk.end > end) {
				break
			} else {
				this.currentChunk = this.chunks.next().value
			}
		}
		this.push(chunk)
		this.position = end + 1
		cb()
	}
}

class SourceDisk extends Disk {
	constructor(source) {
		super(
			true,  // readOnly
			true,  // recordWrites
			true,  // recordReads
			true,  // discardIsZero
		)
		this.source = source
	}

	_getCapacity(callback) {
		this.source.getMetadata()
		.catch(callback)
		.then((metadata) => {
			callback(null, metadata.size)
		})
	}

	_read(buffer, bufferOffset, length, fileOffset, callback) {
		this.source.read(buffer, bufferOffset, length, fileOffset)
		.catch(callback)
		.then((bytesRead, buffer) => {
			callback(null, bytesRead, buffer)
		})
	}
}

export class ConfiguredSource {
	constructor(source, config) {
		this.source = source
		this.config = config
		this.disk = new SourceDisk(source)
	}

	async read(buffer, bufferOffset, length, sourceOffset) {
		return await new Promise((resolve, reject) => {
			this.disk.read(buffer, bufferOffset, length, sourceOffset, (err, bytesRead, buffer) => {
				if (err) {
					reject(err)
					return
				}
				resolve({ bytesRead, buffer })
			})
		})
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
			throw new Error('Not implemented: start and end options')
		}
		const imageStream = await this.source.createReadStream()  // TODO: pass options
		const transform = new FileDiskTransformStream(this.disk)
		imageStream.pipe(transform)
		return transform
	}

	// TODO: implement createSparseReadStream

	async getMetadata() {
		return await this.source.getMetadata()  // TODO: additional metadata?
	}

	async configure() {
		await configure(this.disk, { config: this.config })
	}

	static async fromSource(source, config) {
		const configuredSource = new ConfiguredSource(source, config)
		await configuredSource.configure()
		return configuredSource
	}
}
