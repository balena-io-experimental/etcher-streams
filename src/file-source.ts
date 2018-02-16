import * as Promise from 'bluebird';
import * as _ from 'lodash';
import * as fs from 'mz/fs';

export class FileSource {
	constructor(pathOrFileDesciptor) {
		if (_.isNumber(pathOrFileDesciptor)) {
			this.path = undefined;
			this.fd = pathOrFileDesciptor;
		} else {
			this.path = pathOrFileDesciptor;
			this.fd = undefined;
		}
	}

	async _getFd() {  // TODO close the file descriptor at some point
		if (_.isUndefined(this.fd)) {
			this.fd = await fs.open(this.path, 'r');
		}
		return this.fd;
	}

	async read(buffer, bufferOffset, length, sourceOffset) {
		const fd = await this._getFd();
		return await fs.read(fd, buffer, bufferOffset, length, sourceOffset);
	}

	async createReadStream(options) {
		options = options || {};
		options.fd = await this._getFd();
		options.autoClose = false;
		return await fs.createReadStream(null, options);
	}

	async getMetadata() {
		const fd = await this._getFd();
		return {
			size: (await fs.fstat(fd)).size,
		};
	}
}
