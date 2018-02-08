const _ = require('lodash')
const Promise = require('bluebird')
const unzip = require("unzip-stream")
const progress = require("stream-progressbar")

const getImageStreamFromZipStream = async (zipStream, zipSize) => {
	const imageStream = await new Promise((resolve, reject) => {
		let found = false
		zipStream.on('error', reject)
		const unzipper = unzip.Parse()
		unzipper.on('error', reject)
		let stream = zipStream
		if (!_.isUndefined(zipSize)) {
			stream = stream.pipe(progress('[:bar] :current / :total bytes ; :percent', {total: zipSize, width: 40}))
		}
		stream.pipe(unzipper)
		unzipper.on('entry', (entry) => {
			if (!found && (entry.type === 'File') && (entry.path === 'resin.img')) {
				found = true
				resolve(entry)
			} else {
				entry.autodrain()
			}
		})
		zipStream.on('finish', () => {
			if (!found) {
				reject(new Error("Can't find a resin.img file in this zip"))
			}
		})
	})
	return imageStream
}

export class ResinS3Source {
	constructor(s3, bucket, deviceType, version) {
		this.s3 = s3
		this.bucket = bucket
		this.deviceType = deviceType
		this.version = version
	}

	_getS3Params(compressed) {
		return {
			Bucket: this.bucket,
			Key: `images/${this.deviceType}/${this.version}/image/resin.img${compressed ? '.zip' : ''}`,
		}
	}

	_getRange(start, end) {
		if (!_.isUndefined(start) || !_.isUndefined(end)) {
			start = start || 0
			end = end || ''
			return `bytes=${start}-${end}`
		}
	}
	
	async _getSize(compressed) {
		const data = await this.s3.headObject(this._getS3Params(compressed)).promise()
		return data.ContentLength
	}

	async read(buffer, bufferOffset, length, sourceOffset) {
		const params = this._getS3Params(false)
		params.Range = this._getRange(sourceOffset, sourceOffset + length - 1)
		const data = await this.s3.getObject(params).promise()
		data.Body.copy(buffer, bufferOffset)
		return { bytesRead: data.contentLength, buffer }
	}

	/**
	 * Create a readable stream
	 * @see {@link https://nodejs.org/api/fs.html#fs_fs_createreadstream_path_options}
	 * @param {Object} [options]
	 * @param {Number} [options.start]
	 * @param {Number} [options.end]
	 * @returns stream.Readable
	 */
	async createReadStream(options) {
		// Returns the whole image stream, `start`, `end` and `highWaterMark` options are ignored.
		// This stream is created from the resin.img.zip file in the resin s3 bucket, that is why
		// specifying a `start` and an `end` is not possible, the whole zip file will be read anyway.
		options = options || {}
		if (!_.isUndefined(options.start) || !_.isUndefined(options.end)) {
			throw new Error('`start` and `end` options are not supported')
		}
		const stream = this.s3.getObject(this._getS3Params(true)).createReadStream()
		const zipSize = await this._getSize(true)
		const imageStream = await getImageStreamFromZipStream(stream, zipSize)
		return imageStream
	}

	async getMetadata() {
		return {
			size: await this._getSize(false),
			compressedSize: await this._getSize(true),
		}
	}
}
