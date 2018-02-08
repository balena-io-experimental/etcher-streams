import { S3 } from 'aws-sdk'
import * as Promise from 'bluebird'
import * as fs from 'mz/fs'
import * as commander from 'commander'
import * as progress from 'stream-progressbar'

import { ConfiguredSource } from './configured-source'
import { ResinS3Source } from './resin-s3-source'
import { FileSource } from './file-source'

import { version } from './package.json'

const API_CONFIG = require('./rpi3.config.json')
const DEVICE_TYPE = 'raspberry-pi'
const VERSION = '2.9.6+rev1.prod'
const S3_BUCKET = 'resin-staging-img'

const s3 = new S3({
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

const getSource = (url) => {
	const URL_REGEX = /^(file|resin-s3):\/\/(.*)/
	const result = URL_REGEX.exec(url)
	const protocol = result[1]
	const path = result[2]
	if (protocol === 'file') {
		// file://resin.img
		return new FileSource(path)
	} else if (protocol === 'resin-s3') {
		// resin-s3://resin-staging-img/raspberry-pi/2.9.6+rev1.prod
		const [ bucket, deviceType, version ] = path.split('/')
		return new ResinS3Source(s3, bucket, deviceType, version)
	}
	// TODO: throw an error here
}

const main = async (input, output, configPath) => {
	const source = getSource(input)
	const outputStream = fs.createWriteStream(output)
	let config = API_CONFIG
	try {
		config = await fs.readFile(configPath)
	} catch (e) {
	}

	const configuredSource = await ConfiguredSource.fromSource(source, config)
	const metadata = await configuredSource.getMetadata()
	const stream = await configuredSource.createReadStream({})
	stream
	.pipe(progress('[:bar] :current / :total bytes ; :percent', {total: metadata.size, width: 40}))
	.pipe(outputStream)

	await new Promise((resolve, reject) => {
		outputStream.on('close', resolve)
		outputStream.on('error', reject)
		stream.on('error', reject)
	})
}

commander
.version(version)
.option('-i', '--input <input>', 'Input URL (file:// and resin-s3:// URLs are accepted')
.option('-o', '--output <output>', 'Output file path')  // TODO: accept URLs, use Destination class
.option('-c', '--config [config]', 'Config file path (get a config from dashboard.resin.io)')
.action(main)
.parse(process.argv)
