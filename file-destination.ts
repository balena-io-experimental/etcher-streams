import * as fs from 'mz/fs'
import { Writable } from 'stream'

class FileSparseWriteStream extends Writable {
	constructor(path, size) {
		super({ objectMode: true })
		this.path = path
		this.size = size
		this.fd = undefined
		this.ended = false
	}

	async __createFile() {
		if (this.fd === undefined) {
			await fs.truncate(this.path, this.size)
			this.fd = await fs.open(this.path, 'w')
		}
	}

	async __write(chunk, enc) {
		await this.__createFile()
		if (chunk !== undefined) {
			await fs.write(this.fd, chunk, 0, chunk.length, chunk.position)	
		}
		if (this.ended) {
			await fs.close(this.fd)
			this.emit('close')
		}
	}
	
	async __end(chunk, enc) {
		// .end() will be called before the last write callback, this means we can't close the fd here.
		this.ended = true
		await this.__write(chunk, enc)
	}

	_write(chunk, enc, callback) {
		this.__write(chunk, enc).then(callback)
	}

	end(chunk, enc, callback) {
		this.__end(chunk, enc).then(callback)
	}
}

export class FileDestination {
	constructor(path, size) {
		this.path = path
		this.size = size
	}

	async createWriteStream(options) {
		return fs.createWriteStream(this.path, options)
	}

	async createSparseWriteStream(options) {
		return new FileSparseWriteStream(this.path, this.size)
	}
}
