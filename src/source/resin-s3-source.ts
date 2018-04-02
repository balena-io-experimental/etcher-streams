import * as AWS from 'aws-sdk';
import { ReadResult } from 'file-disk';
import * as _ from 'lodash';
import * as unzip from 'unzip-stream';

import { Source, SourceMetadata } from './source';

const getImageStreamFromZipStream = async (zipStream: NodeJS.ReadableStream): Promise<NodeJS.ReadableStream> => {
	return await new Promise((resolve: (entry: unzip.ZipStreamEntry ) => void, reject: (err: Error) => void) => {
		let found = false;
		zipStream.on('error', reject);
		const unzipper = unzip.Parse();
		unzipper.on('error', reject);
		zipStream.pipe(unzipper);
		unzipper.on('entry', (entry: unzip.ZipStreamEntry ) => {
			if (!found && (entry.type === 'File') && (entry.path === 'resin.img')) {
				found = true;
				resolve(entry);
			} else {
				entry.autodrain();
			}
		});
		zipStream.on('finish', () => {
			if (!found) {
				reject(new Error("Can't find a resin.img file in this zip"));
			}
		});
	});
};

export class NoContentLength extends Error {
	constructor(source: ResinS3Source) {
		super(`No content length for resin s3 source ${source.bucket} ${source.deviceType} ${source.version}`);
	}
}

export class ResinS3Source implements Source {
	constructor(private s3: AWS.S3, readonly bucket: string, readonly deviceType: string, readonly version: string) {
	}

	_getS3Params(compressed: boolean): AWS.S3.Types.GetObjectRequest {
		return {
			Bucket: this.bucket,
			Key: `images/${this.deviceType}/${this.version}/image/resin.img${compressed ? '.zip' : ''}`,
		};
	}

	_getRange(start?: number, end?: number): string | undefined {
		if (!_.isUndefined(start) || !_.isUndefined(end)) {
			return `bytes=${start || 0}-${end || ''}`;
		}
	}

	async _getSize(compressed: boolean): Promise<number> {
		const data = await this.s3.headObject(this._getS3Params(compressed)).promise();
		if (data.ContentLength === undefined) {
			throw new NoContentLength(this);
		}
		return data.ContentLength;
	}

	async read(buffer: Buffer, bufferOffset: number, length: number, sourceOffset: number): Promise<ReadResult> {
		const params = this._getS3Params(false);
		params.Range = this._getRange(sourceOffset, sourceOffset + length - 1);
		const data = await this.s3.getObject(params).promise();
		if (data.ContentLength === undefined) {
			throw new NoContentLength(this);
		}
		(data.Body as Buffer).copy(buffer, bufferOffset);
		return { bytesRead: data.ContentLength, buffer };
	}

	async createReadStream(): Promise<NodeJS.ReadableStream> {
		const stream = this.s3.getObject(this._getS3Params(true)).createReadStream();
		return await getImageStreamFromZipStream(stream);
	}

	async getMetadata(): Promise<SourceMetadata> {
		return {
			size: await this._getSize(false),
			compressedSize: await this._getSize(true),
		};
	}
}
