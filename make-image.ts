const Promise = require('bluebird')
const aws = require('aws-sdk')
const fs = require('mz/fs')

import { ResinS3Source } from './resin-s3-source'
import { ConfiguredSource } from './configured-source'

const API_CONFIG = require('./rpi3.config.json')
const DEVICE_TYPE = 'raspberry-pi'
const VERSION = '2.9.6+rev1.prod'
const S3_BUCKET = 'resin-staging-img'

const s3 = new aws.S3({
	accessKeyId: null,
	secretAccessKey: null,
	s3ForcePathStyle: true,
	sslEnabled: false,
})

// Make it work without accessKeyId and secretAccessKey
for (let key of [ 'getObject', 'headObject' ]) {
	s3[key] = (...args) => {
		return s3.makeUnauthenticatedRequest(key, ...args)
	}
}

const pipeAndWait = async (...streams) => {
	if (streams.length <= 1) {
		throw new Error('pipeAndWait needs at least 2 arguments')
	}
	await new Promise((resolve, reject) => {
		for (let i=1; i<streams.length; i++) {
			streams[i - 1].on('error', reject)
			streams[i].on('error', reject)
			streams[i - 1].pipe(streams[i])
		}
		streams[streams.length - 1].on('close', resolve)
	})
}

const main = async () => {
	try {
		const source = new ResinS3Source(s3, S3_BUCKET, DEVICE_TYPE, VERSION)
		const configuredSource = await ConfiguredSource.fromSource(source, API_CONFIG)
		const stream = await configuredSource.createReadStream({})

		const buffer = Buffer.alloc(1024)
		const bufferOffset = 0
		const length = buffer.length
		const sourceOffset = 0
		const data = await configuredSource.read(buffer, bufferOffset, length, sourceOffset)
		console.log('data', data)

		await pipeAndWait(stream, fs.createWriteStream('resin.img'))
	} catch (e) {
		console.log('error', e)
	}
}

main()
